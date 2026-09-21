const fs = require('fs');

const generatorsPath = 'd:/New folder/napsis/src/components/Generators.tsx';
const content = fs.readFileSync(generatorsPath, 'utf8');

// Find the location to insert (after UdvnUpcomingGenerator and before MAIN GENERATORS PAGE)
const marker = '// ─── MAIN GENERATORS PAGE ─────────────────────────────────────────────────────';
const markerIndex = content.indexOf(marker);

if (markerIndex === -1) {
  console.error('Could not find MAIN GENERATORS PAGE marker');
  process.exit(1);
}

const before = content.substring(0, markerIndex);
const after = content.substring(markerIndex);

// Read the full UDVN code
const udvnCodePath = 'd:/New folder/napsis/udvn-generators-code.txt';
const udvnCode = fs.readFileSync(udvnCodePath, 'utf8');

// Extract only the remaining 3 generators (UdvnCompletedGenerator, OdzLetterGenerator, ProtocolGenerator)
// They start after line 338 "// UDVN COMPLETED GENERATOR"
const lines = udvnCode.split('\n');
const completedStartIdx = lines.findIndex(l => l.includes('// UDVN COMPLETED GENERATOR'));

if (completedStartIdx === -1) {
  console.error('Could not find UDVN COMPLETED GENERATOR marker');
  process.exit(1);
}

const remainingGenerators = lines.slice(completedStartIdx).join('\n');

// Combine
const newContent = before + remainingGenerators + '\n\n' + after;

fs.writeFileSync(generatorsPath, newContent, 'utf8');
console.log('✅ Added remaining 3 UDVN generators (Completed, ODZ Letter, Protocol)');
