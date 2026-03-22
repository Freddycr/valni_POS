# Documentación Técnica: Migración de Registro de Ventas a Supabase

## 1. Introducción
Este documento detalla el plan de migración de la aplicación actual (Google Sheets + Firebase) a una arquitectura moderna basada en **Supabase**. El cambio proporcionará una base de datos relacional real (PostgreSQL), autenticación integrada, mejor rendimiento y mayor escalabilidad.

### 1.1 Beneficios de la Migración
- **Integridad Referencial**: Postgres asegura que no existan ventas sin productos válidos o clientes inexistentes.
- **Rendimiento**: Búsquedas y reportes mucho más rápidos gracias a los índices de base de datos.
- **Concurrencia**: Manejo robusto de múltiples usuarios escribiendo datos simultáneamente (evita sobrescrituras en Google Sheets).
- **Seguridad**: Row Level Security (RLS) permite definir permisos granulares a nivel de base de datos.
- **Autenticación real**: Uso de JWT y proveedores de identidad estándar.

### 1.2 Comparativa de Componentes
| Componente | Sistema Actual | Nueva Versión (Supabase) |
| :--- | :--- | :--- |
| **Base de Datos** | Google Sheets | PostgreSQL |
| **Backend** | Firebase Functions | Edge Functions / Postgres Functions |
| **Auth** | Lógica manual en Sheets | Supabase Auth (Integrado) |
| **Almacenamiento** | URL Base64 en Sheets | Supabase Storage (para logos/fotos) |


## 2. Arquitectura de Datos (PostgreSQL)

Se proponen las siguientes tablas en Supabase. Se utilizarán UUIDs para IDs primarios y claves foráneas para integridad referencial.

### 2.1 Tablas Principales

#### Perfiles de Usuario (`profiles`)
Extiende la tabla `auth.users` de Supabase.
- `id`: uuid (PK, references auth.users)
- `full_name`: text
- `role`: text (check constraint: 'admin', 'seller', 'agent')
- `active`: boolean (default true)
- `created_at`: timestamptz

#### Clientes (`customers`)
- `id`: uuid (PK)
- `full_name`: text
- `address`: text
- `dni`: text (unique)
- `phone`: text
- `created_at`: timestamptz

#### Marcas (`brands`)
- `id`: uuid (PK)
- `name`: text (unique)

#### Modelos (`models`)
- `id`: uuid (PK)
- `brand_id`: uuid (FK -> brands)
- `name`: text

#### Productos (`products`)
- `id`: uuid (PK)
- `type`: text (check: 'individual', 'generic')
- `name`: text
- `description`: text
- `price`: numeric(12,2)
- `min_price`: numeric(12,2)
- `stock`: integer
- `brand_id`: uuid (FK -> brands, optional)
- `model_id`: uuid (FK -> models, optional)
- `imei1`: text (unique, optional)
- `imei2`: text (unique, optional)
- `serial_number`: text (unique, optional)
- `status`: text (default 'No registrado')
- `location`: text
- `created_at`: timestamptz

#### Ventas (`sales`)
- `id`: uuid (PK)
- `date`: timestamptz (default now())
- `seller_id`: uuid (FK -> profiles)
- `customer_id`: uuid (FK -> customers)
- `total`: numeric(12,2)

#### Detalle de Venta (`sale_items`)
- `id`: uuid (PK)
- `sale_id`: uuid (FK -> sales)
- `product_id`: uuid (FK -> products)
- `quantity`: integer
- `unit_price`: numeric(12,2)
- `imei1`: text
- `imei2`: text
- `serial_number`: text

#### Pagos (`sale_payments`)
- `id`: uuid (PK)
- `sale_id`: uuid (FK -> sales)
- `payment_method`: text
- `amount`: numeric(12,2)

### 2.2 Configuración y Otros
- `app_config`: Tabla llave-valor para el encabezado del recibo y logo.
- `payment_methods`: Tabla para gestionar los métodos de pago disponibles.

## 3. Seguridad (RLS - Row Level Security)
Se implementarán políticas RLS para asegurar que:
- Solo admins puedan gestionar usuarios y productos.
- Vendedores puedan ver productos y registrar sus propias ventas.
- Todos los usuarios autenticados puedan ver clientes.

## 4. Lógica de Negocio (Backend)

### Supabase Edge Functions
Las funciones actuales de Firebase se reemplazarán por:
1. **`process-sale`**: Una Edge Function que maneje la transacción de venta, descuente stock y registre los ítems. Alternativamente, se puede usar un procedimiento almacenado (RPC) en Postgres para mayor atomicidad.
2. **`get-daily-report`**: Una función para generar el resumen del día.

### Triggers y Funciones
1. **Trigger de Stock**: Al insertar en `sale_items`, descontar automáticamente del stock en `products`.
2. **Trigger de Perfil**: Crear automáticamente un registro en `profiles` cuando un nuevo usuario se registra en `auth.users`.

## 5. Integración Frontend

Se debe instalar el cliente de Supabase:
```bash
npm install @supabase/supabase-js
```

Se reemplazará `functionsApi.ts` por un nuevo servicio `supabaseApi.ts` que utilice el cliente directamente o llame a las funciones RPC/Edge.

## 6. Plan de Migración de Datos

1. **Exportación**: Descargar las hojas de Google Sheets como CSV.
2. **Limpieza**: Normalizar los datos (unificar formatos de fecha, limpiar DNIs repetidos).
3. **Carga**: Utilizar un script de Node.js o la herramienta de importación de Supabase para subir los datos en orden jerárquico (Marcas -> Modelos -> Productos -> Clientes -> Ventas).

## 7. Próximos Pasos Recomendados
1. Inicializar el proyecto local con `supabase init`.
2. Aplicar los scripts SQL de creación de tablas (Migrations).
3. Configurar la autenticación por email en el dashboard de Supabase.
4. Desarrollar la lógica de transacciones en Postgres.
