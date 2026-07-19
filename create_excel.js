const XLSX = require('xlsx');
const fs = require('fs');

const ws_data = [
  ["Nombre", "Categoria", "Precio"],
  ["Pan de Muerto", "Pan Dulce", 25.50],
  ["Rosca de Reyes", "Especialidades", 350.00],
  ["Rol de Canela", "Pan Dulce", 18.00],
  ["Bigote de Cajeta", "Pan Dulce", 15.00],
  ["Empanada de Piña", "Pan Dulce", 14.50],
  ["Panque de Nuez", "Pasteles", 85.00],
  ["Polvoron", "Galletas", 10.00],
  ["Pinguino", "Abarrotes", 22.00],
  ["Jugo de Naranja", "Bebidas", 35.00],
  ["Chilindrina", "Pan Dulce", 12.00]
];

const ws = XLSX.utils.aoa_to_sheet(ws_data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Catálogo");
XLSX.writeFile(wb, "/Users/simonsanchez/Downloads/POSPAN/catalogo_ejemplo.xlsx");
console.log("Excel creado.");
