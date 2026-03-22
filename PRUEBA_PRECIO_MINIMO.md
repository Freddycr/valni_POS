# Prueba de Edición de Precio Mínimo

## Escenario 1: Edición Manual del Precio Mínimo

1. Abrir la aplicación
2. Navegar a "Gestión de Productos"
3. Hacer clic en "Agregar Producto"
4. Seleccionar "Individual" como tipo de producto
5. Ingresar los datos del producto:
   - Marca: Samsung
   - Modelo: Galaxy S21
   - Precio: 1000
6. Verificar que el precio mínimo se establezca automáticamente en 941 (1000 - 59)
7. Modificar manualmente el precio mínimo a 900
8. Verificar que el precio mínimo se mantenga en 900 incluso si se cambia el precio
9. Guardar el producto

## Escenario 2: Validación de Precios

1. Abrir un producto individual existente para edición
2. Intentar establecer un precio mínimo mayor que el precio de venta
3. Verificar que se muestre un mensaje de error: "El precio mínimo no puede ser mayor que el precio de venta."
4. Corregir el precio mínimo a un valor válido
5. Guardar el producto

## Escenario 3: Comportamiento con Productos Genéricos

1. Crear un producto genérico
2. Verificar que no se muestre el campo de precio mínimo
3. Guardar el producto

## Escenario 4: Edición de Producto Existente

1. Abrir un producto individual existente para edición
2. Modificar el precio de venta
3. Verificar que si el precio mínimo no ha sido modificado manualmente, se actualice automáticamente
4. Si el precio mínimo fue modificado manualmente, verificar que se mantenga sin cambios
5. Guardar el producto

## Resultados Esperados

- El campo de precio mínimo debe ser editable para productos individuales
- El precio mínimo debe poder establecerse manualmente
- El precio mínimo no debe poder ser mayor que el precio de venta
- El precio mínimo debe actualizarse automáticamente solo si no ha sido modificado manualmente
- Los productos genéricos no deben mostrar el campo de precio mínimo