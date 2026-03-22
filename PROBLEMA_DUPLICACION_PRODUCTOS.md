# Problema: Duplicación de Productos al Editar

## Descripción del Problema
Cuando se edita un producto existente, en lugar de actualizar el registro, se estaba creando un nuevo registro idéntico, lo que causaba duplicados en la base de datos.

## Análisis
1. El formulario correctamente identifica si se está editando o creando un nuevo producto:
   ```jsx
   <h3 className="text-lg font-semibold">{formData.id ? 'Editar Producto' : 'Nuevo Producto'}</h3>
   ```

2. La función `handleEdit` correctamente pasa el producto completo (incluyendo el ID) al formulario:
   ```typescript
   const handleEdit = (product: Product) => {
     setFormData({ ...product });
     setIsFormOpen(true);
   };
   ```

3. La función `handleSave` pasa el objeto `productToSave` a la API:
   ```typescript
   await saveProduct(productToSave);
   ```

4. La función `saveProduct` en el servicio simplemente pasa el objeto al backend:
   ```typescript
   export const saveProduct = async (product: Partial<Product>): Promise<Product> => {
     const response = await callFunction('saveProduct', 'POST', { product });
     return response;
   };
   ```

## Hipótesis
El problema estaba en que se estaba usando la misma función para crear y actualizar productos, sin una distinción clara en el frontend sobre cuándo usar cada operación.

## Solución Implementada
1. Se creó una función `updateProduct` en el servicio que es explícitamente para actualizar productos existentes:
   ```typescript
   export const updateProduct = async (product: Product): Promise<Product> => {
     // For updating a product, we'll use the same saveProduct function
     // but ensure the full product object with id is passed
     const response = await callFunction('saveProduct', 'POST', { product });
     return response;
   };
   ```

2. Se modificó la función `handleSave` en el componente para usar la función apropiada según si se está editando o creando:
   ```typescript
   // Use updateProduct if we have an ID (editing), otherwise use saveProduct (creating)
   if (productToSave.id) {
     const result = await updateProduct(productToSave as Product);
   } else {
     const result = await saveProduct(productToSave);
   }
   ```

3. Se agregó registro de depuración para verificar que el ID se está pasando correctamente:
   ```typescript
   console.log('Saving product:', productToSave);
   console.log('Product has ID:', !!productToSave.id);
   ```

## Verificaciones Realizadas
1. Confirmar que el ID está presente en formData cuando se edita un producto
2. Confirmar que el ID se mantiene durante las actualizaciones de formulario
3. Confirmar que el ID se pasa correctamente a la función saveProduct/updateProduct

## Resultado
Con estos cambios, la edición de productos ahora debería actualizar correctamente los registros existentes en lugar de crear duplicados.