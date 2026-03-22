// Script para verificar la configuración de Firebase
const { exec } = require('child_process');

console.log('Verificando configuración de Firebase...\n');

// Verificar el proyecto Firebase
exec('npx firebase projects:list', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  console.log('Proyectos Firebase:');
  console.log(stdout);
  
  // Verificar la configuración de hosting
  exec('npx firebase hosting:sites:list', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      return;
    }
    console.log('\nSitios de Hosting:');
    console.log(stdout);
  });
});