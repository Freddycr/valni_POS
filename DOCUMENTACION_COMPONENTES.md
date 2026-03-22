# Documentación de Componentes - Sistema de Registro de Ventas

## Descripción General

El Sistema de Registro de Ventas es una aplicación web desarrollada en React con TypeScript que permite gestionar ventas de productos, clientes, usuarios y generar reportes. La aplicación cuenta con una interfaz intuitiva y responsive que facilita la gestión de un negocio de venta de productos electrónicos.

## Componentes Principales

### 1. App.tsx
Componente principal de la aplicación que maneja:
- La autenticación de usuarios
- La navegación entre diferentes vistas
- La gestión del estado global de la aplicación
- La integración de todos los componentes de la interfaz

### 2. SalesForm.tsx
Componente central para registrar nuevas ventas. Funcionalidades:
- Búsqueda y selección de clientes
- Creación de nuevos clientes
- Búsqueda de productos con filtros por marca, modelo, estado y ubicación
- Tabla de "Agregar Productos Seleccionados" con columna "Estado" para ver el estado de cada equipo
- Agregar productos al carrito de compras
- Configuración de métodos de pago
- Generación de ventas con impresión de recibos

### 3. PurchaseOrderManagementScreen.tsx
Componente para la gestión de pedidos de compra. Se divide en dos pestañas:

#### Pestaña "Lista de Pedidos"
- Muestra una lista de todos los pedidos de compra con su ID, fecha, proveedor, total y estado.
- Permite exportar la lista de pedidos a un archivo de Excel.

#### Pestaña "Generar Nuevo Pedido"
- Permite generar sugerencias de pedidos de compra basadas en los niveles de stock.
- Filtros por marca, modelo y estado de stock.
- Las sugerencias de productos se agrupan por nombre, marca y modelo, y se suma el stock para obtener una sugerencia más precisa.
- Permite la adición manual de artículos al pedido, lo que permite duplicados si tienen características diferentes.
- Permite exportar la sugerencia de pedido a un archivo de Excel.
- Permite crear un pedido de compra a partir de la sugerencia.

### 4. Receipt.tsx
Componente para la visualización e impresión de recibos de venta:
- Diseño responsive para impresión térmica
- Visualización de información del cliente, vendedor y productos
- Soporte para logos personalizados
- Formato de moneda peruana (PEN)

### 4. SimpleLoginScreen.tsx
Pantalla de inicio de sesión:
- Formulario de autenticación con correo y contraseña
- Validación de credenciales
- Manejo de errores de autenticación

### 5. ResponsiveSidebar.tsx
Barra lateral de navegación:
- Menú responsive para dispositivos móviles y escritorio
- Navegación entre diferentes secciones de la aplicación
- Visualización de información del usuario logueado
- Opciones de cierre de sesión

### 6. ReportsScreen.tsx
Pantalla de reportes generales:
- Visualización de todas las ventas registradas
- Filtros por vendedor, producto, método de pago, DNI y fechas
- Visualización de detalles de ventas
- Funcionalidad de impresión de recibos desde el reporte
- Gráficos de análisis de ventas

### 7. DailyReportScreen.tsx
Pantalla de reportes diarios:
- Reportes detallados por día específico
- **Manejo correcto de la zona horaria de Perú (UTC-5) para el filtrado de ventas.**
- Información de ventas por hora
- Resumen por vendedor y método de pago
- Visualización detallada de productos vendidos

### 8. UserManagementScreen.tsx
Gestión de usuarios:
- Listado de todos los usuarios del sistema
- Creación de nuevos usuarios
- Restablecimiento de contraseñas
- Asignación de roles (administrador o vendedor)

### 9. ProductManagementScreen.tsx
Gestión de productos:
- Listado y filtrado de productos
- Creación y edición de productos individuales y genéricos
- Manejo de IMEI, números de serie y estados de productos
- Gestión de stock y ubicaciones (Tienda/Almacén)
- Funcionalidad de movimiento en bloque entre ubicaciones

### 10. ConfigurationScreen.tsx
Configuración del sistema:
- Personalización del encabezado de recibos
- Subida de logo para recibos
- Vista previa de configuración

### 11. LogoUploader.tsx
Componente para la carga de logos:
- Selección de archivos de imagen
- Conversión a formato base64
- Vista previa de la imagen seleccionada

### 12. WhatsAppScreen.tsx
Integración con WhatsApp:
- Envío de mensajes automatizados a clientes
- Personalización de mensajes con información de ventas

### 13. PaymentMethodsScreen.tsx
Gestión de métodos de pago:
- Configuración de métodos de pago disponibles
- Creación y edición de métodos de pago

### 14. BrandManagementScreen.tsx
Gestión de marcas:
- Administración de marcas de productos
- Creación y edición de marcas

### 15. ModelManagementScreen.tsx
Gestión de modelos:
- Administración de modelos de productos
- Relación con marcas
- Creación y edición de modelos

### 16. Header.tsx
Componente de encabezado:
- Barra de navegación superior
- Información del usuario actual

### 17. Sidebar.tsx
Barra lateral de navegación:
- Menú de navegación principal
- Enlaces a diferentes secciones de la aplicación

### 18. FirstTimeSetup.tsx
Configuración inicial:
- Asistente para la configuración inicial del sistema
- Creación del primer usuario administrador

### 19. ConfigErrorScreen.tsx
Pantalla de error de configuración:
- Visualización de errores de configuración
- Instrucciones para corregir problemas de configuración

## Servicios

### functionsApi.ts
Servicio de comunicación con Firebase Functions:
- Autenticación de usuarios
- Gestión de productos, clientes y usuarios
- Operaciones de ventas
- Generación de reportes
- Configuración del sistema

### api.ts
Servicio de comunicación con Google Sheets API:
- Operaciones CRUD con hojas de cálculo
- Manejo de datos de ventas, productos y usuarios

## Utilidades

### formatting.ts
Funciones de formateo:
- Formato de moneda peruana
- Formato de fechas

### printReceipt.ts
Funciones de impresión:
- Generación de recibos para impresión

## Tipos de Datos (types.ts)

### User
Información de usuarios del sistema:
- id: Identificador único
- email: Correo electrónico
- fullName: Nombre completo
- role: Rol (admin o seller)

### Product
Información de productos:
- id: Identificador único
- type: Tipo (individual o genérico)
- name: Nombre del producto
- description: Descripción
- price: Precio
- stock: Cantidad en inventario
- Campos específicos para productos individuales (marca, modelo, IMEI, etc.)

### Customer
Información de clientes:
- id: Identificador único
- fullName: Nombre completo
- address: Dirección
- dni: Documento de identidad
- phone: Teléfono

### Sale
Información de ventas:
- id: Identificador único
- date: Fecha de venta
- sellerId: ID del vendedor
- customerId: ID del cliente
- total: Total de la venta
- items: Productos vendidos
- payments: Métodos de pago utilizados

## Configuración (config.ts)

Variables de configuración del sistema:
- GOOGLE_CLIENT_ID: ID de cliente OAuth de Google
- GOOGLE_API_KEY: Clave de API de Google
- SPREADSHEET_ID: ID de la hoja de cálculo de Google Sheets
- FUNCTIONS_BASE_URL: URL base para las funciones de Firebase

## Características Principales

1. **Gestión de Usuarios**: Creación, edición y autenticación de usuarios con roles diferenciados.
2. **Gestión de Productos**: Control de inventario con soporte para productos individuales (con IMEI) y genéricos.
3. **Ventas**: Registro de ventas con múltiples métodos de pago.
4. **Clientes**: Base de datos de clientes con información de contacto.
5. **Reportes**: Generación de reportes diarios y generales con filtros avanzados.
6. **Recibos**: Impresión de recibos con formato personalizable.
7. **Integración WhatsApp**: Envío automatizado de mensajes a clientes.
8. **Configuración**: Personalización del sistema y recibos.

## Tecnologías Utilizadas

- React con TypeScript
- Tailwind CSS para estilos
- Firebase Functions para el backend
- Google Sheets API para almacenamiento de datos
- Recharts para visualización de datos