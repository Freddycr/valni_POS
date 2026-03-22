// config.ts

// INSTRUCCIONES:
// 1. Ve a la consola de Google Cloud: https://console.cloud.google.com/
// 2. Crea un nuevo proyecto.
// 3. Ve a "APIs y servicios" > "Biblioteca" y habilita la "API de Google Sheets".
// 4. Ve a "APIs y servicios" > "Credenciales".
//
// 5. CREA UNA CLAVE DE API:
//    - Haz clic en "+ CREAR CREDENCIALES" > "Clave de API".
//    - Pega la clave generada en la constante GOOGLE_API_KEY.
//    - MUY IMPORTANTE: Haz clic en la clave que creaste y RESTRINGE su uso a "Sitios web", añadiendo la URL de tu app (ej. http://localhost:3000)
//
// 6. CREA UN ID DE CLIENTE OAUTH:
//    - Haz clic en "+ CREAR CREDENCIALES" > "ID de cliente de OAuth".
//    - Si te lo pide, configura la "Pantalla de consentimiento".
//    - Selecciona "Aplicación web" como tipo de aplicación.
//    - En "Orígenes de JavaScript autorizados", añade la URL donde se alojará tu app (ej. http://localhost:3000).
//    - Pega el "ID de cliente" (NO el secreto) en la constante GOOGLE_CLIENT_ID.
//
// 7. CONFIGURA GOOGLE SHEETS:
//    - Crea una nueva hoja de cálculo y obtén su ID de la URL.
//    - El ID es la parte larga entre "/d/" y "/edit".
//    - Pega el ID en SPREADSHEET_ID.
//    - Haz clic en "Compartir" y dale permisos de "Editor" a las cuentas de Google de los usuarios que utilizarán la app.
//    - Asegúrate de que tu Google Sheet tenga las siguientes pestañas con estos nombres exactos:
//      - Usuarios, Productos, Clientes, Ventas, Detalle_Venta, Detalle_Venta_Metodo_Pago

export const GOOGLE_CLIENT_ID: string = '590779768578-krvi0c41qtueln4u3764a4pjj74agfks.apps.googleusercontent.com';
export const GOOGLE_API_KEY: string = 'AIzaSyBmgC2EKWZzQ6Lwov9FQtnX7AzBO-OVtK4';
export const SPREADSHEET_ID = '1rVd86G5gKOYnlBXqA5f0nv9844NXqUKc_p1csLW4Q-s'; // Reemplaza esto también si usas tu propia hoja.

// URL base para las Firebase Functions
export const FUNCTIONS_BASE_URL = 'https://us-central1-registroventas-466719.cloudfunctions.net';