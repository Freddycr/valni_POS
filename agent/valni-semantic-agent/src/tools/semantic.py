from __future__ import annotations

import ast
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
import json

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore[assignment]

import requests
from klisk import tool

def _resolve_timezone() -> timezone:
    tz_name = os.getenv("BUSINESS_TIMEZONE", "America/Lima")
    if ZoneInfo is not None:
        try:
            return ZoneInfo(tz_name)  # type: ignore[return-value]
        except Exception:
            pass
    # Fallback for Windows environments without tzdata package.
    return timezone(timedelta(hours=-5))


BUSINESS_TIMEZONE = _resolve_timezone()
SEMANTIC_SERVICE_URL = os.getenv("SEMANTIC_SERVICE_URL", "http://127.0.0.1:8787/semantic-query")
SEMANTIC_SERVICE_TIMEOUT_SECONDS = float(os.getenv("SEMANTIC_SERVICE_TIMEOUT_SECONDS", "8"))
DEFAULT_COMPANY_ID = os.getenv("DEFAULT_COMPANY_ID", "").strip()
MAX_PREVIEW_ROWS = int(os.getenv("SEMANTIC_MAX_PREVIEW_ROWS", "40"))
LAST_EXECUTION_RESULT: dict[str, Any] | None = None


METRIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "net_sales": ("venta", "ventas", "facturacion", "ingreso", "importe vendido"),
    "orders": ("orden", "ordenes", "pedido", "pedidos", "operaciones", "transacciones"),
    "avg_ticket": ("ticket promedio", "promedio por venta", "ticket medio"),
    "distinct_customers": ("clientes", "clientes distintos", "clientes unicos"),
    "items_sold": ("unidades vendidas", "cantidad vendida", "cantidad de productos"),
    "item_revenue": ("venta de productos", "ingreso por producto", "recaudacion por producto"),
    "payments_total": ("cobros", "pagos", "monto cobrado"),
    "payments_count": ("cantidad de pagos", "numero de pagos"),
    "on_hand_qty": ("stock", "inventario", "existencias", "unidades en almacen"),
    "stock_value": ("valor inventario", "valor de inventario", "inventario valorizado"),
    "item_total": ("precio", "monto", "a que precio", "precio vendido", "total item"),
}


def _today_lima() -> datetime:
    return datetime.now(BUSINESS_TIMEZONE)


def _parse_single_date(raw: str) -> datetime | None:
    cleaned = raw.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            parsed = datetime.strptime(cleaned, fmt)
            if parsed.year < 100:
                parsed = parsed.replace(year=2000 + parsed.year)
            return parsed
        except ValueError:
            continue
    return None


def _extract_date_range(question: str) -> tuple[str, str] | None:
    q = question.lower()
    today = _today_lima().date()

    if "hoy" in q:
        date_str = today.isoformat()
        return date_str, date_str

    if "ayer" in q:
        date_str = (today - timedelta(days=1)).isoformat()
        return date_str, date_str

    last_days_match = re.search(r"(?:ultim|últim)(?:o|a|os|as)\s+(\d{1,2})\s+d(?:i|í)as", q)
    if last_days_match:
        days = max(1, int(last_days_match.group(1)))
        date_to = today
        date_from = today - timedelta(days=days - 1)
        return date_from.isoformat(), date_to.isoformat()

    date_hits = re.findall(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", question)
    if len(date_hits) >= 2:
        d1 = _parse_single_date(date_hits[0])
        d2 = _parse_single_date(date_hits[1])
        if d1 and d2:
            date_from = min(d1.date(), d2.date())
            date_to = max(d1.date(), d2.date())
            return date_from.isoformat(), date_to.isoformat()

    if len(date_hits) == 1:
        d1 = _parse_single_date(date_hits[0])
        if d1:
            date_str = d1.date().isoformat()
            return date_str, date_str

    return None


def _extract_customer_doc_number(question: str) -> str | None:
    q = question.lower()
    explicit_doc = re.search(r"(?:dni|doc(?:umento)?(?:\s*(?:nro|numero|n°))?)\s*[:#-]?\s*([0-9]{6,15})", q)
    if explicit_doc:
        return explicit_doc.group(1)

    if "dni" in q:
        fallback = re.search(r"\b([0-9]{8})\b", q)
        if fallback:
            return fallback.group(1)

    return None


def _extract_imei(question: str) -> str | None:
    imei_match = re.search(r"(?:imei|imeni)\s*[:#-]?\s*([a-z0-9]{8,25})", question.lower())
    if not imei_match:
        return None
    return imei_match.group(1).upper()


def _extract_serial(question: str) -> str | None:
    serial_match = re.search(r"(?:s\/n|serial(?:\s*(?:nro|numero|n°))?)\s*[:#-]?\s*([a-z0-9-]{4,40})", question.lower())
    if not serial_match:
        return None
    return serial_match.group(1).upper()


def _extract_sale_id(question: str) -> str | None:
    sale_id_match = re.search(
        r"\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b",
        question.lower(),
    )
    return sale_id_match.group(1) if sale_id_match else None


def _is_operations_lookup(question: str) -> bool:
    q = question.lower()
    return any(
        keyword in q
        for keyword in (
            "dni",
            "imei",
            "imeni",
            "serial",
            "s/n",
            "quien compro",
            "quién compró",
            "que productos compro",
            "qué productos compró",
            "detalle de compra",
            "detalle de venta",
        )
    )


def _detect_dataset(question: str) -> str:
    q = question.lower()
    if _is_operations_lookup(question):
        return "sales_operations"
    if any(keyword in q for keyword in ("inventario", "stock", "existencias", "almacen")):
        return "inventory"
    if any(keyword in q for keyword in ("cobro", "cobros", "metodo de pago", "metodos de pago", "pago", "pagos")):
        return "payments"
    if any(keyword in q for keyword in ("por producto", "producto", "imei", "serial")):
        return "sale_items"
    return "sales"


def _detect_metrics(question: str, dataset: str) -> list[str]:
    q = question.lower()
    detected: list[str] = []

    for metric, keywords in METRIC_KEYWORDS.items():
        if any(keyword in q for keyword in keywords):
            detected.append(metric)

    allowed_by_dataset: dict[str, set[str]] = {
        "sales": {"net_sales", "orders", "avg_ticket", "distinct_customers"},
        "sale_items": {"items_sold", "item_revenue", "distinct_products", "distinct_sales"},
        "payments": {"payments_total", "payments_count", "avg_payment", "distinct_sales"},
        "inventory": {"on_hand_qty", "available_qty", "stock_value", "sku_count"},
        "sales_operations": {"item_total", "lines_count", "sales_count"},
    }

    filtered = [m for m in detected if m in allowed_by_dataset.get(dataset, set())]
    if filtered:
        return filtered

    defaults: dict[str, list[str]] = {
        "sales": ["net_sales", "orders"],
        "sale_items": ["item_revenue", "items_sold"],
        "payments": ["payments_total", "payments_count"],
        "inventory": ["on_hand_qty", "stock_value"],
        "sales_operations": ["item_total"],
    }
    return defaults.get(dataset, ["net_sales"])


def _detect_dimensions(question: str, dataset: str) -> list[str]:
    q = question.lower()
    dims: list[str] = []

    if dataset == "sales_operations":
        return [
            "sale_id",
            "day",
            "time",
            "customer_name",
            "customer_doc_number",
            "product_name",
            "quantity",
            "unit_price",
            "item_total_amount",
            "sale_total_amount",
            "payment_methods",
            "captured_imei",
            "captured_serial",
            "store_name",
            "seller_name",
        ]

    if any(k in q for k in ("por dia", "diario", "dia por dia", "por fecha")):
        dims.append("day")

    if any(k in q for k in ("por vendedor", "vendedor", "asesor")):
        dims.append("seller_name")

    if any(k in q for k in ("por producto", "producto", "imei", "serial")):
        dims.append("product_name")

    if any(k in q for k in ("por ubicacion", "ubicacion", "tienda", "almacen")):
        dims.append("location_bin")

    if any(k in q for k in ("por tienda", "por local", "sede")):
        dims.append("store_name")

    if not dims:
        defaults = {
            "sales": ["day"],
            "sale_items": ["day", "product_name"],
            "payments": ["day", "payment_method_label"],
            "inventory": ["location_bin"],
        }
        return defaults.get(dataset, ["day"])

    # Preserve order while removing duplicates.
    return list(dict.fromkeys(dims))


def _detect_location_filter(question: str) -> str | None:
    q = question.lower()
    if " en tienda" in q or "ubicacion tienda" in q:
        return "Tienda"
    if " en almacen" in q or "ubicacion almacen" in q:
        return "Almacen"
    return None


def _build_filters(question: str, dataset: str, date_range: tuple[str, str] | None) -> dict[str, Any]:
    # Inventory is always a current snapshot ("as of now"), no date window.
    date_from = None if dataset == "inventory" else (date_range[0] if date_range else None)
    date_to = None if dataset == "inventory" else (date_range[1] if date_range else None)
    filters: dict[str, Any] = {
        "date_from": date_from,
        "date_to": date_to,
    }

    if dataset in {"sale_items", "inventory"}:
        filters["location_bin"] = _detect_location_filter(question)

    if dataset == "sales_operations":
        customer_doc = _extract_customer_doc_number(question)
        imei = _extract_imei(question)
        serial = _extract_serial(question)
        sale_id = _extract_sale_id(question)
        filters.update(
            {
                "customer_doc_number": customer_doc,
                "captured_imei": imei,
                "captured_serial": serial,
                "lookup_code": imei or serial,
                "sale_id": sale_id,
            }
        )

    return filters


def _is_smalltalk(question: str) -> bool:
    q = question.lower().strip()
    if not q:
        return True

    normalized = re.sub(r"[!¡?¿.,;:()\-_\s]+", " ", q).strip()
    smalltalk_tokens = {
        "hola",
        "hi",
        "hello",
        "buenos dias",
        "buenas tardes",
        "buenas noches",
        "gracias",
        "ok",
        "vale",
        "listo",
    }

    return normalized in smalltalk_tokens


def _build_clarification(
    question: str,
    dataset: str,
    date_range: tuple[str, str] | None,
    filters: dict[str, Any],
) -> dict[str, Any] | None:
    if dataset == "sales_operations":
        has_lookup_filter = any(
            bool(filters.get(key))
            for key in ("customer_doc_number", "captured_imei", "captured_serial", "lookup_code", "sale_id")
        )
        if not has_lookup_filter:
            return {
                "needs_clarification": True,
                "clarification_question": (
                    "Para buscar una operacion puntual, indica al menos un dato: DNI, IMEI, serial o sale_id."
                ),
                "reason": "missing_lookup_identifier",
                "suggested_options": [
                    "DNI 12345678",
                    "IMEI 354196710049378",
                    "S/N SHDP7QCXKTH",
                ],
            }
        return None

    if dataset == "inventory":
        return None

    if date_range is None:
        return {
            "needs_clarification": True,
            "clarification_question": (
                "Que rango de fechas debo usar? Puedes indicar hoy, ayer, ultimos 7 dias o una fecha/rango exacto."
            ),
            "reason": "missing_date_range",
            "suggested_options": ["hoy", "ayer", "ultimos 7 dias", "28/02/2026"],
        }

    return None


def _coerce_json_object(value: Any) -> tuple[dict[str, Any] | None, str | None]:
    """Accept JSON text or dict and return a dict payload."""
    if isinstance(value, dict):
        return value, None

    if not isinstance(value, str):
        return None, "El valor recibido no es texto JSON ni objeto."

    raw = value.strip()
    if not raw:
        return None, "El valor JSON esta vacio."

    candidates: list[str] = []
    normalized = raw

    # Remove markdown code fences if present.
    if normalized.startswith("```"):
        normalized = re.sub(r"^```(?:json)?\s*", "", normalized, flags=re.IGNORECASE)
        normalized = re.sub(r"\s*```$", "", normalized)

    candidates.append(normalized)

    # Try extracting first JSON-like object from mixed text.
    start = normalized.find("{")
    end = normalized.rfind("}")
    if start != -1 and end != -1 and end > start:
        extracted = normalized[start : end + 1]
        if extracted not in candidates:
            candidates.append(extracted)

    parsed: Any = None
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            break
        except json.JSONDecodeError:
            try:
                parsed = ast.literal_eval(candidate)
                break
            except (ValueError, SyntaxError):
                parsed = None

    if parsed is None:
        return None, "No se pudo parsear JSON."

    # Handle the case where parsed value is a JSON string containing another JSON object.
    if isinstance(parsed, str):
        try:
            reparsed = json.loads(parsed)
            parsed = reparsed
        except json.JSONDecodeError:
            pass

    if not isinstance(parsed, dict):
        return None, "El JSON debe representar un objeto."

    return parsed, None


def _to_float(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        if isinstance(value, str):
            cleaned = value.replace("S/", "").replace(",", "").strip()
            return float(cleaned) if cleaned else 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: Any) -> int:
    try:
        if value is None:
            return 0
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return 0
            return int(float(cleaned))
        return int(value)
    except (TypeError, ValueError):
        return 0


def _extract_payment_methods(raw_methods: Any) -> list[str]:
    if raw_methods is None:
        return []

    if isinstance(raw_methods, list):
        return [str(item).strip() for item in raw_methods if str(item).strip()]

    text = str(raw_methods).strip()
    if not text:
        return []

    # JSON-like array encoded as text.
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except json.JSONDecodeError:
            pass

    return [part.strip() for part in text.split(",") if part.strip()]


def _build_sales_operations_insight(rows: list[dict[str, Any]]) -> dict[str, Any]:
    sales_seen: set[str] = set()
    customers_seen: set[tuple[str, str]] = set()
    payment_methods_seen: set[str] = set()
    products_qty: dict[str, int] = {}
    imeis_seen: set[str] = set()
    serials_seen: set[str] = set()
    sale_totals: dict[str, float] = {}

    total_item_amount = 0.0
    total_units = 0
    latest_day: str | None = None
    operations_detail: list[dict[str, Any]] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        sale_id = str(row.get("sale_id") or "").strip()
        if sale_id:
            sales_seen.add(sale_id)

        day = str(row.get("day") or "").strip()
        if day and (latest_day is None or day > latest_day):
            latest_day = day

        customer_name = str(row.get("customer_name") or "").strip()
        customer_doc = str(row.get("customer_doc_number") or "").strip()
        if customer_name or customer_doc:
            customers_seen.add((customer_name, customer_doc))

        product_name = str(row.get("product_name") or "").strip()
        quantity = _to_int(row.get("quantity"))
        if product_name:
            products_qty[product_name] = products_qty.get(product_name, 0) + max(quantity, 0)
        total_units += max(quantity, 0)

        item_total = _to_float(row.get("item_total_amount") or row.get("item_total"))
        total_item_amount += item_total

        sale_total = _to_float(row.get("sale_total_amount"))
        if sale_id and sale_total > 0:
            current = sale_totals.get(sale_id, 0.0)
            if sale_total > current:
                sale_totals[sale_id] = sale_total

        for method in _extract_payment_methods(row.get("payment_methods")):
            payment_methods_seen.add(method)

        imei = str(row.get("captured_imei") or "").strip()
        if imei:
            imeis_seen.add(imei)

        serial = str(row.get("captured_serial") or "").strip()
        if serial:
            serials_seen.add(serial)

        if len(operations_detail) < 8:
            operations_detail.append(
                {
                    "sale_id": sale_id or None,
                    "day": day or None,
                    "customer_name": customer_name or None,
                    "customer_doc_number": customer_doc or None,
                    "product_name": product_name or None,
                    "quantity": max(quantity, 0),
                    "unit_price": round(_to_float(row.get("unit_price")), 2),
                    "item_total_amount": round(item_total, 2),
                    "sale_total_amount": round(_to_float(row.get("sale_total_amount")), 2),
                    "payment_methods": _extract_payment_methods(row.get("payment_methods")),
                    "seller_name": str(row.get("seller_name") or "").strip() or None,
                    "store_name": str(row.get("store_name") or "").strip() or None,
                    "captured_imei": imei or None,
                    "captured_serial": serial or None,
                }
            )

    top_products = sorted(products_qty.items(), key=lambda item: (-item[1], item[0]))[:5]
    total_sale_amount = sum(sale_totals.values()) if sale_totals else total_item_amount

    customers = []
    for name, doc in sorted(customers_seen):
        if name and doc:
            customers.append(f"{name} ({doc})")
        elif name:
            customers.append(name)
        elif doc:
            customers.append(doc)

    return {
        "sales_count": len(sales_seen),
        "customers": customers,
        "total_sale_amount": round(total_sale_amount, 2),
        "total_item_amount": round(total_item_amount, 2),
        "total_units": total_units,
        "payment_methods": sorted(payment_methods_seen),
        "top_products": [
            {"name": product_name, "units": qty}
            for product_name, qty in top_products
        ],
        "latest_day": latest_day,
        "imeis": sorted(imeis_seen),
        "serials": sorted(serials_seen),
        "operations_detail": operations_detail,
    }


@tool
async def plan_semantic_query(question: str, company_id: str | None = None) -> dict[str, Any]:
    """Convert natural language into a validated DSL plan.

    Returns either:
    - needs_clarification=true with a follow-up question, or
    - dsl payload ready for execution in semantic-query-service.
    """
    if not question or not question.strip():
        return {
            "ok": False,
            "needs_clarification": True,
            "clarification_question": "Escribe la consulta que deseas analizar.",
            "reason": "empty_question",
        }

    if _is_smalltalk(question):
        return {
            "ok": True,
            "needs_clarification": True,
            "clarification_question": (
                "Hola. Puedo ayudarte con ventas, operaciones por DNI/IMEI/SN e inventario. "
                "Que deseas consultar?"
            ),
            "reason": "smalltalk",
            "suggested_options": [
                "Quien compro el celular con IMEI 864895073310243?",
                "Que productos compro el cliente con DNI 40143407?",
                "Inventario por ubicacion ultimos 7 dias",
            ],
            "company_id": company_id or DEFAULT_COMPANY_ID or None,
        }

    dataset = _detect_dataset(question)
    metrics = _detect_metrics(question, dataset)
    date_range = _extract_date_range(question)
    filters = _build_filters(question, dataset, date_range)

    clarification = _build_clarification(question, dataset, date_range, filters)
    if clarification:
        clarification["ok"] = True
        clarification["company_id"] = company_id or DEFAULT_COMPANY_ID or None
        return clarification

    dsl = {
        "dataset": dataset,
        "metrics": metrics,
        "dimensions": _detect_dimensions(question, dataset),
        "filters": filters,
        "limit": 120 if dataset == "sales_operations" else 200,
    }

    return {
        "ok": True,
        "needs_clarification": False,
        "dsl": dsl,
        "traceability": {
            "source": "plan_semantic_query",
            "timezone": str(BUSINESS_TIMEZONE),
            "company_id": company_id or DEFAULT_COMPANY_ID or None,
        },
    }


@tool
async def execute_semantic_query(
    dsl_json: str,
    company_id: str | None = None,
    user_id: str | None = None,
    question: str | None = None,
) -> dict[str, Any]:
    """Execute a previously planned DSL against semantic-query-service.

    dsl_json must be a JSON string produced from the dsl object.
    """
    global LAST_EXECUTION_RESULT
    resolved_company_id = (company_id or DEFAULT_COMPANY_ID or "").strip()
    if not resolved_company_id:
        return {
            "ok": False,
            "status": "missing_company_id",
            "error": "company_id es obligatorio para ejecutar la consulta.",
        }

    if isinstance(dsl_json, str) and (not dsl_json or not dsl_json.strip()):
        return {
            "ok": False,
            "status": "invalid_dsl",
            "error": "dsl_json invalido. Debe ser un JSON con dataset, metrics, filters y limit.",
        }

    dsl, parse_error = _coerce_json_object(dsl_json)
    if parse_error:
        return {
            "ok": False,
            "status": "invalid_dsl_json",
            "error": f"No se pudo parsear dsl_json. {parse_error}",
        }

    if not dsl:
        return {
            "ok": False,
            "status": "invalid_dsl",
            "error": "dsl_json debe representar un objeto JSON.",
        }

    try:
        response = requests.post(
            SEMANTIC_SERVICE_URL,
            json={
                "dsl": dsl,
                "companyId": resolved_company_id,
                "userId": (user_id or "").strip() or None,
                "question": (question or "").strip() or None,
            },
            timeout=SEMANTIC_SERVICE_TIMEOUT_SECONDS,
        )
    except requests.RequestException as error:
        return {
            "ok": False,
            "status": "network_error",
            "error": "No se pudo conectar con semantic-query-service.",
            "details": str(error),
            "service_url": SEMANTIC_SERVICE_URL,
        }

    try:
        payload = response.json()
    except ValueError:
        payload = {"ok": False, "error": "Respuesta no JSON del servicio semantico."}

    if response.status_code >= 400 or not payload.get("ok"):
        return {
            "ok": False,
            "status": "query_error",
            "http_status": response.status_code,
            "error": payload.get("error") or "Error desconocido en semantic-query-service.",
            "details": payload.get("details"),
            "code": payload.get("code"),
            "service_url": SEMANTIC_SERVICE_URL,
        }

    rows = payload.get("rows") or []
    row_count = int(payload.get("rowCount") or len(rows))

    result = {
        "ok": True,
        "company_id": resolved_company_id,
        "dsl": payload.get("dsl") or dsl,
        "meta": payload.get("meta") or {},
        "row_count": row_count,
        "duration_ms": payload.get("durationMs"),
        "rows_preview": rows[:MAX_PREVIEW_ROWS],
        "rows_preview_count": min(len(rows), MAX_PREVIEW_ROWS),
        "rows_truncated": len(rows) > MAX_PREVIEW_ROWS,
        "service_url": SEMANTIC_SERVICE_URL,
    }
    LAST_EXECUTION_RESULT = result
    return result


@tool
async def explain_semantic_result(
    question: str, execution_result_json: str
) -> dict[str, Any]:
    """Build a deterministic answer shell with traceability from execution output.

    execution_result_json must be a JSON string from execute_semantic_query output.
    """
    global LAST_EXECUTION_RESULT
    execution_result, parse_error = _coerce_json_object(execution_result_json)
    if parse_error:
        if LAST_EXECUTION_RESULT:
            execution_result = LAST_EXECUTION_RESULT
        else:
            return {
                "ok": False,
                "summary": "No se pudo parsear execution_result_json. Revisa si el JSON esta bien formado.",
                "traceability": {
                    "status": "invalid_execution_result_json",
                    "error": parse_error,
                },
            }

    if not execution_result:
        return {
            "ok": False,
            "summary": "No se pudo parsear execution_result_json. Revisa si el JSON esta bien formado.",
            "traceability": {
                "status": "invalid_execution_result_json",
                "error": "El resultado de ejecucion esta vacio.",
            },
        }

    if not execution_result.get("ok"):
        return {
            "ok": False,
            "summary": "No se pudo responder la consulta por un error en ejecucion.",
            "traceability": {
                "status": execution_result.get("status"),
                "error": execution_result.get("error"),
                "service_url": execution_result.get("service_url"),
            },
        }

    dsl = execution_result.get("dsl") or {}
    filters = dsl.get("filters") or {}
    metrics = dsl.get("metrics") or []
    dimensions = dsl.get("dimensions") or []

    date_from = filters.get("date_from")
    date_to = filters.get("date_to")
    range_text = f"{date_from} a {date_to}" if date_from and date_to else "no definido"
    rows_preview = execution_result.get("rows_preview") or []
    row_count = execution_result.get("row_count", 0)

    summary = (
        "Consulta ejecutada correctamente. "
        f"Metricas: {', '.join(metrics) or 'sin metricas'}. "
        f"Rango: {range_text}. "
        f"Filas: {row_count}."
    )
    operations_insight: dict[str, Any] | None = None
    if dsl.get("dataset") == "inventory":
        summary = (
            "Inventario actual obtenido correctamente (instantanea del momento). "
            "Incluye solo equipos/accesorios con stock mayor a 0. "
            f"Filas: {row_count}."
        )

    if dsl.get("dataset") == "sales_operations":
        operations_insight = _build_sales_operations_insight(rows_preview)
        customer_preview = ", ".join(operations_insight.get("customers", [])[:3]) or "No identificado"
        methods_preview = ", ".join(operations_insight.get("payment_methods", [])[:4]) or "No definido"
        products_preview = ", ".join(
            f"{item['name']} ({item['units']})"
            for item in operations_insight.get("top_products", [])[:4]
        ) or "No definido"
        summary = (
            "Consulta operativa ejecutada correctamente. "
            f"Cliente(s): {customer_preview}. "
            f"Operaciones: {operations_insight.get('sales_count', row_count)}. "
            f"Monto vendido: S/ {operations_insight.get('total_sale_amount', 0):.2f}. "
            f"Unidades: {operations_insight.get('total_units', 0)}. "
            f"Productos: {products_preview}. "
            f"Metodos de pago: {methods_preview}. "
            f"Ultima fecha: {operations_insight.get('latest_day') or 'No definida'}."
        )

    traceability: dict[str, Any] = {
        "question": question,
        "company_id": execution_result.get("company_id"),
        "dataset": dsl.get("dataset"),
        "metrics": metrics,
        "dimensions": dimensions,
        "location_bin": filters.get("location_bin"),
        "row_count": execution_result.get("row_count"),
        "duration_ms": execution_result.get("duration_ms"),
        "service_url": execution_result.get("service_url"),
    }

    if dsl.get("dataset") == "inventory":
        traceability["time_scope"] = "as_of_now"
        traceability["snapshot_at"] = _today_lima().isoformat()
    else:
        traceability["date_from"] = date_from
        traceability["date_to"] = date_to

    return {
        "ok": True,
        "summary": summary,
        "table": rows_preview,
        "insights": operations_insight or {},
        "traceability": traceability,
    }
