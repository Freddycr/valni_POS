# Instrucciones para Configurar el Logo en el Encabezado de Recibos

## Configuración de la Hoja de Google Sheets

1. **Abre tu hoja de Google Sheets** en el navegador
2. **Crea una nueva pestaña** llamada `Configuracion`
3. **En la celda A1**, ingresa el texto del encabezado (por ejemplo: "TIENDA DE CELULARES XYZ")
4. **En la celda B1**, se almacenará el logo en formato base64 (no es necesario ingresar nada manualmente)

La estructura debe ser:
```
A1: Texto del encabezado
B1: Datos del logo (base64)
```

## Cómo Usar la Función de Logo

1. **Inicia sesión** en la aplicación desplegada: https://registroventas-466719.web.app
2. **Ve a la sección de Configuración** en el menú lateral
3. **Selecciona una imagen JPG/JPEG/PNG** de tu computadora
4. **Haz clic en "Guardar Configuración"**
5. **El logo aparecerá** en la vista previa y en los recibos impresos

## Recomendaciones para el Logo

- **Formato recomendado**: JPG o PNG
- **Tamaño ideal**: 200x100 píxeles aproximadamente
- **Tamaño máximo de archivo**: 500KB
- **Colores**: Preferiblemente con buen contraste para impresión en blanco y negro

## Vista Previa

Cuando configures el logo correctamente, los recibos tendrán este aspecto:

```
      [LOGO DE LA EMPRESA]
    =========================
      NOMBRE DE LA TIENDA
    =========================

Fecha: 05/09/2025        Ticket: SALE-12345
Vendedor: Juan Pérez     Cliente: María González
                         DNI: 12345678

Producto             Cant.  Precio   Total
----------------------------------------
iPhone 15 Pro         1     S/ 4,500 S/ 4,500
----------------------------------------
TOTAL:                          S/ 4,500

Método de Pago:
Efectivo                    S/ 4,500

        Gracias por su compra
               ***
```

## Problemas Comunes y Soluciones

1. **Logo no aparece**: 
   - Verifica que la pestaña se llame exactamente `Configuracion`
   - Asegúrate de que las celdas A1 y B1 existan en esa pestaña

2. **Logo se ve pixelado**:
   - Usa una imagen de mayor resolución
   - Considera comprimir la imagen antes de subirla

3. **Error al guardar**:
   - Verifica que el archivo no exceda 500KB
   - Asegúrate de usar formatos JPG, JPEG o PNG