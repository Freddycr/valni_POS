# Guía de Configuración de Permisos para Google Sheets

Esta guía te ayudará a configurar correctamente los permisos necesarios para que la aplicación pueda leer y escribir en la hoja de cálculo de Google Sheets.

## 1. Configuración del Proyecto en Google Cloud

### 1.1 Crear un Proyecto
1. Ve a la [Consola de Google Cloud](https://console.cloud.google.com/)
2. Si no tienes un proyecto, crea uno nuevo haciendo clic en "Seleccionar proyecto" y luego "Nuevo proyecto"
3. Dale un nombre a tu proyecto y haz clic en "Crear"

### 1.2 Habilitar las APIs Necesarias
1. En el menú de navegación, ve a "APIs y servicios" > "Biblioteca"
2. Busca y habilita las siguientes APIs:
   - Google Sheets API
   - Google People API

### 1.3 Crear Credenciales

#### 1.3.1 Crear una Clave de API
1. Ve a "APIs y servicios" > "Credenciales"
2. Haz clic en "+ CREAR CREDENCIALES" > "Clave de API"
3. Copia la clave generada y péguala en el archivo `config.ts` en la constante `GOOGLE_API_KEY`
4. Haz clic en la clave que creaste y RESTRINGE su uso:
   - En "Restricciones de la aplicación", selecciona "Sitios web"
   - En "Restricciones de sitios web", añade la URL donde se alojará tu app (ej. http://localhost:3000)

#### 1.3.2 Crear un ID de Cliente OAuth
1. En la misma página de credenciales, haz clic en "+ CREAR CREDENCIALES" > "ID de cliente de OAuth"
2. Si te lo pide, configura la "Pantalla de consentimiento"
3. Selecciona "Aplicación web" como tipo de aplicación
4. En "Orígenes de JavaScript autorizados", añade la URL donde se alojará tu app (ej. http://localhost:3000)
5. En "URIs de redireccionamiento autorizados", añade la URL donde se alojará tu app (ej. http://localhost:3000)
6. Copia el "ID de cliente" (NO el secreto) y pégalo en el archivo `config.ts` en la constante `GOOGLE_CLIENT_ID`

## 2. Configuración de la Hoja de Cálculo de Google Sheets

### 2.1 Crear la Hoja de Cálculo
1. Ve a [Google Sheets](https://sheets.google.com) y crea una nueva hoja de cálculo
2. Obtén el ID de la hoja de la URL. El ID es la parte larga entre "/d/" y "/edit"
3. Pega el ID en el archivo `config.ts` en la constante `SPREADSHEET_ID`

### 2.2 Configurar las Pestañas
Asegúrate de que tu hoja de cálculo tenga las siguientes pestañas con estos nombres exactos:
- Usuarios
- Productos
- Clientes
- Ventas
- Detalle_Venta
- Detalle_Venta_Metodo_Pago
- Metodos_Pago
- Marcas
- Modelos
- Configuracion

### 2.3 Configurar los Encabezados de las Pestañas

#### Pestaña "Usuarios"
| ID | Correo Electrónico | Rol | Nombre Completo | Contraseña |
|----|--------------------|-----|------------------|------------|

#### Pestaña "Productos"
| ID | Tipo | Nombre | Descripción | Precio | Stock | Marca | Modelo | IMEI1 | IMEI2 | Número de Serie | Estado | Precio Mínimo |
|----|------|--------|-------------|--------|-------|-------|--------|-------|-------|------------------|--------|---------------|

#### Pestaña "Clientes"
| ID | Nombre Completo | Dirección | DNI | Teléfono |
|----|------------------|-----------|-----|----------|

#### Pestaña "Ventas"
| ID | Fecha | ID Vendedor | ID Cliente | Total |
|----|-------|-------------|------------|-------|

#### Pestaña "Detalle_Venta"
| ID Venta | ID Producto | Cantidad | Precio de Venta | IMEI1 | IMEI2 | Número de Serie |
|----------|-------------|----------|------------------|-------|-------|------------------|

#### Pestaña "Detalle_Venta_Metodo_Pago"
| ID Venta | Método de Pago | Monto |
|----------|----------------|-------|

#### Pestaña "Metodos_Pago"
| ID | Nombre |
|----|--------|

#### Pestaña "Marcas"
| ID | Nombre |
|----|--------|

#### Pestaña "Modelos"
| ID | ID Marca | Nombre |
|----|----------|--------|

#### Pestaña "Configuracion"
| Encabezado del Recibo |
|------------------------|

### 2.4 Compartir la Hoja de Cálculo
1. Haz clic en el botón "Compartir" en la esquina superior derecha
2. Añade las cuentas de Google de los usuarios que utilizarán la app
3. Dale a cada usuario permisos de "Editor"

## 3. Pruebas de Permisos

### 3.1 Verificar Permisos de Lectura
1. Inicia la aplicación
2. Intenta iniciar sesión con credenciales válidas
3. Si puedes acceder, los permisos de lectura están configurados correctamente

### 3.2 Verificar Permisos de Escritura
1. Una vez iniciada la sesión, intenta crear un nuevo usuario, producto o cliente
2. Verifica en la hoja de cálculo que los datos se han guardado correctamente
3. Si los datos aparecen en la hoja, los permisos de escritura están configurados correctamente

## 4. Solución de Problemas Comunes

### 4.1 Error 403: Permiso Denegado
- Verifica que la cuenta de Google que estás usando tenga permisos de "Editor" en la hoja de cálculo
- Asegúrate de que las credenciales de Google Cloud (clave de API e ID de cliente) sean correctas
- Confirma que las APIs de Google Sheets y Google People estén habilitadas en tu proyecto

### 4.2 Error 404: Hoja de Cálculo No Encontrada
- Verifica que el `SPREADSHEET_ID` en `config.ts` sea correcto
- Asegúrate de que la hoja de cálculo exista y no haya sido eliminada

### 4.3 Error de Autenticación
- Confirma que la URL donde se aloja la aplicación esté añadida como "Origen de JavaScript autorizado" y "URI de redireccionamiento autorizado" en las credenciales de OAuth
- Verifica que la clave de API esté restringida correctamente a la URL de la aplicación

## 5. Soporte Adicional

Si continúas teniendo problemas después de seguir esta guía, por favor:

1. Verifica la consola del navegador (F12) para ver mensajes de error detallados
2. Asegúrate de que estás usando la última versión del código
3. Consulta con un administrador del sistema para verificar los permisos de la cuenta de Google