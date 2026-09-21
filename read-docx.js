const fs = require('fs');
const PizZip = require('pizzip');

const files = [
  'dist/templates/УДВН шаблони/Доклад по УДВН м. Септември.docx',
  'dist/templates/УДВН шаблони/писмо ОДЗ УДВН съгласуване  м. Септември - Copy.docx'
];

files.forEach(file => {
  console.log('\n\n========================================');
  console.log('FILE:', file);
  console.log('========================================\n');

  try {
    const content = fs.readFileSync(file, 'binary');
    const zip = new PizZip(content);
    const xml = zip.file('word/document.xml').asText();

    // Extract text from XML
    const textMatches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const text = textMatches.map(t => t.replace(/<[^>]*>/g, '')).join('');

    console.log(text);
    console.log('\n\nXML snippet (first 2000 chars):');
    console.log(xml.substring(0, 2000));
  } catch (err) {
    console.error('Error reading', file, ':', err.message);
  }
});
