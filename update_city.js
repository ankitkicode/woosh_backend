const fs = require('fs');
let file = fs.readFileSync('src/models/City.ts', 'utf8');
if(!file.includes('areas: string[]')) {
  file = file.replace('pincodes: string[];', 'pincodes: string[];\n  areas: string[];');
  file = file.replace('pincodes: [{ type: String, trim: true }],', 'pincodes: [{ type: String, trim: true }],\n    areas: [{ type: String, trim: true }],');
  fs.writeFileSync('src/models/City.ts', file);
  console.log('Updated City.ts');
}

let controller = fs.readFileSync('src/controllers/city.controller.ts', 'utf8');
if(!controller.includes(', areas } = req.body')) {
  controller = controller.replace('longitude, serviceRadius, pincodes } = req.body;', 'longitude, serviceRadius, pincodes, areas } = req.body;');
  controller = controller.replace('pincodes,\n      location:', 'pincodes,\n      areas,\n      location:');
  controller = controller.replace('pincodes } = req.body;', 'pincodes, areas } = req.body;');
  controller = controller.replace('pincodes\n    }', 'pincodes,\n      areas\n    }');
  fs.writeFileSync('src/controllers/city.controller.ts', controller);
  console.log('Updated city.controller.ts');
}
