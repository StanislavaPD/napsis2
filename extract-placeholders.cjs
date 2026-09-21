const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || 'public/templates/Напояване шаблони/акт.docx';

try {
  const zip = new AdmZip(filePath);
  const documentXml = zip.readAsText('word/document.xml');

  // Find all {PLACEHOLDER} patterns
  const placeholders = new Set();
  const regex = /\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(documentXml)) !== null) {
    placeholders.add(match[1]);
  }

  console.log('\n=== PLACEHOLDERS FOUND ===');
  console.log([...placeholders].sort().join('\n'));
  console.log('\n=== TOTAL:', placeholders.size, '===\n');

  // Also show a snippet of the content
  console.log('\n=== DOCUMENT TEXT PREVIEW ===');
  const textOnly = documentXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(textOnly.substring(0, 1000));
  console.log('...\n');

} catch (err) {
  console.error('Error:', err.message);
}
