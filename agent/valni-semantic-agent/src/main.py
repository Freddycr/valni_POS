import os

from klisk import define_agent, get_tools

# OpenRouter models require OPENROUTER_API_KEY in many LiteLLM setups.
# Fallback to OPENAI_API_KEY if provided, to avoid silent auth failures.
if not os.getenv("OPENROUTER_API_KEY") and os.getenv("OPENAI_API_KEY"):
    os.environ["OPENROUTER_API_KEY"] = os.getenv("OPENAI_API_KEY", "")

# Ensure tool modules are imported so @tool registration happens.
try:
    from src.tools import semantic as _semantic_tools  # type: ignore[attr-defined] # noqa: F401
except ModuleNotFoundError:
    from tools import semantic as _semantic_tools  # noqa: F401


agent = define_agent(
    name="VALNI DataCopilot",
    instructions=(
        "Eres un agente de reportes para VALNI.\n"
        "Reglas obligatorias:\n"
        "1) Usa la secuencia de tools: plan_semantic_query -> execute_semantic_query -> explain_semantic_result, excepto en saludos o charla corta.\n"
        "2) Si plan_semantic_query devuelve needs_clarification=true, pregunta exactamente la aclaracion y espera respuesta del usuario.\n"
        "2.1) Convierte dsl a texto JSON y pasalo como dsl_json a execute_semantic_query.\n"
        "2.1.1) Si el contexto del mensaje trae user_id y pregunta, pasalos a execute_semantic_query.\n"
        "2.2) Convierte la salida de execute_semantic_query a texto JSON y pasala como execution_result_json a explain_semantic_result.\n"
        "3) Nunca inventes numeros ni SQL. Solo usa datos del resultado de tools.\n"
        "4) Si hay error de tool, explica el error en lenguaje simple y sugiere como corregirlo.\n"
        "5) En cada respuesta final incluye una seccion 'Trazabilidad'. "
        "Para datasets con rango temporal, incluye metrica, rango de fechas y filtros. "
        "Para inventario, no pidas ni muestres rango: indica 'instantanea actual (as_of_now)' y filtros.\n"
        "6) Responde siempre en espanol y de forma concisa.\n"
        "7) Debes soportar consultas operativas por DNI/IMEI/serial: quien compro, que productos compro, fecha, precio y metodo de pago.\n"
        "8) Para consultas operativas (DNI/IMEI/SN), entrega respuesta enriquecida con: cliente, fecha(s), producto(s), cantidades, precios, metodos de pago, vendedor, tienda y totales.\n"
        "9) Si explain_semantic_result devuelve summary e insights, prioriza esos datos en la respuesta final."
    ),
    model=os.getenv("AGENT_MODEL", "openrouter/google/gemini-2.0-flash-001"),
    tools=get_tools(
        "plan_semantic_query",
        "execute_semantic_query",
        "explain_semantic_result",
    ),
)
