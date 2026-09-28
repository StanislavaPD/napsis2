const fs = require('fs');

// Read the XML file
const xml = fs.readFileSync('temp_pl6.xml', 'utf8');

// Extract all text elements
const textMatches = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
const texts = textMatches.map(m => m.replace(/<[^>]*>/g, ''));

// Concatenate consecutive texts to find split placeholders
let fullText = '';
for (let i = 0; i < texts.length; i++) {
    fullText += texts[i];
}

// Find all {placeholder} patterns
const placeholders = fullText.match(/\{[^}]+\}/g) || [];
const uniquePlaceholders = [...new Set(placeholders)];

console.log('Found placeholders in Приложение 6:');
uniquePlaceholders.forEach(p => console.log(p));
