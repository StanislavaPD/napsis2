const fs = require('fs');
const AdmZip = require('adm-zip');

function addPlaceholdersToDocx(inputPath, outputPath, replacements) {
  console.log(`Processing: ${inputPath}`);

  // Read the docx file
  const zip = new AdmZip(inputPath);

  // Get document.xml
  let docXml = zip.readAsText('word/document.xml');

  // Apply replacements
  replacements.forEach(({ find, replace }) => {
    const regex = new RegExp(find, 'g');
    const count = (docXml.match(regex) || []).length;
    docXml = docXml.replace(regex, replace);
    if (count > 0) {
      console.log(`  ✓ Replaced "${find.substring(0, 30)}..." → "${replace}" (${count} times)`);
    }
  });

  // Update the document.xml in zip
  zip.updateFile('word/document.xml', Buffer.from(docXml, 'utf8'));

  // Write the modified file
  zip.writeZip(outputPath);
  console.log(`  ✓ Saved: ${outputPath}\n`);
}

// Приложение 6 - GDPR Декларация
const gdpr_replacements = [
  { find: 'Долуподписаният/ата……………………………………………………\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.…\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.…\\.\\.\\.\\.\\.',
    replace: 'Долуподписаният/ата {kontragent}' },
  { find: 'ЕГН…………\\.\\.\\.…………\\.\\.',
    replace: 'ЕГН {egn}' },
  { find: 'ЛК№…………………………………\\.\\.\\.\\.\\.\\.\\.………\\.,издадена на…\\.\\.\\.…\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.…-от\\.\\.\\.\\.\\.\\.\\.…\\.\\.\\.\\.\\.…\\.\\.\\.\\.\\.\\.\\.…\\.\\.\\.\\.\\.',
    replace: 'ЛК№ {lk_number}, издадена на {lk_date} от {lk_place}' },
  { find: 'Дата:\\s*Декларатор:',
    replace: 'Дата: {data}        Декларатор: {kontragent}' }
];

// Приложение 1 - Заявление
const application_replacements = [
  { find: '№_______________________________________________',
    replace: '№ {nomer}' },
  { find: '/Водоползвател/',
    replace: '{kontragent}' },
  { find: 'ПИ№…………………………………\\.',
    replace: 'ПИ№ {pi_nomer}' },
  { find: 'НС……………………………………………\\.\\.',
    replace: 'НС {ns}' },
  { find: 'съоръжение/………………',
    replace: 'съоръжение {saoraжenie}' },
  { find: '№напоителен канал',
    replace: '№ {kanal}' },
  { find: 'в срок до……………\\.',
    replace: 'в срок до {srok_data}' },
  { find: 'Измервателно устройство N ………………………………\\.',
    replace: 'Измервателно устройство N {izmervatelen_nomer}' },
  { find: 'монтирано на …………………',
    replace: 'монтирано на {montaj_data}' },
  { find: 'ДОСТАВЧИК: ……………………\\.',
    replace: 'ДОСТАВЧИК: "НАПОИТЕЛНИ СИСТЕМИ" ЕАД' },
  { find: 'ВОДОПОЛЗВАТЕЛ: ………………………',
    replace: 'ВОДОПОЛЗВАТЕЛ: {kontragent}' }
];

// Приложение 2 - Протокол
const protocol_replacements = [
  { find: 'Днес…………………г\\.',
    replace: 'Днес {data}' },
  { find: 'ВОДОПОЛЗВАТЕЛ:…………………………………………………………………',
    replace: 'ВОДОПОЛЗВАТЕЛ: {kontragent}' },
  { find: 'За Водоползвател……………………………………………………………………\\.\\.',
    replace: 'За Водоползвател: {predstavlyava}' },
  { find: 'Договор №……………………………………',
    replace: 'Договор № {dogovor_nomer}' },
  { find: 'ДОСТАВЧИК……………………ВОДОПОЛЗВАТЕЛ:………………………',
    replace: 'ДОСТАВЧИК: инж. Николай Касидов        ВОДОПОЛЗВАТЕЛ: {kontragent}' }
];

// Приложение 3 - Рекапитулация
const recap_replacements = [
  { find: 'Днес…………………г\\.',
    replace: 'Днес {data}' },
  { find: 'ВОДОПОЛЗВАТЕЛ:…………………………………………………………………',
    replace: 'ВОДОПОЛЗВАТЕЛ: {kontragent}' },
  { find: 'За Водоползвател……………………………………………………………………\\.\\.',
    replace: 'За Водоползвател: {predstavlyava}' },
  { find: 'Договор №……………………………………',
    replace: 'Договор № {dogovor_nomer}' },
  { find: 'ДОСТАВЧИК……………………',
    replace: 'ДОСТАВЧИК: инж. Николай Касидов        ВОДОПОЛЗВАТЕЛ: {kontragent}' }
];

const templatesDir = 'public/templates/Напояване шаблони';

// Process each file
try {
  addPlaceholdersToDocx(
    `${templatesDir}/Приложение 6.docx`,
    `${templatesDir}/Приложение 6.docx`,
    gdpr_replacements
  );

  addPlaceholdersToDocx(
    `${templatesDir}/Приложение 1.docx`,
    `${templatesDir}/Приложение 1.docx`,
    application_replacements
  );

  addPlaceholdersToDocx(
    `${templatesDir}/Приложение 2.docx`,
    `${templatesDir}/Приложение 2.docx`,
    protocol_replacements
  );

  addPlaceholdersToDocx(
    `${templatesDir}/Приложение 3.docx`,
    `${templatesDir}/Приложение 3.docx`,
    recap_replacements
  );

  console.log('✅ All templates updated with placeholders!');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
