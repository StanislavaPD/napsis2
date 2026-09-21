const fs = require('fs');
const path = 'd:/New folder/napsis/src/components/Generators.tsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// ПРАВИЛНИ данни от ekatte.com
const newLocalities = `const YAMBOL_LOCALITIES: Record<string, LocalityInfo> = {
  // Община Болярово (19 населени места)
  'гр. Болярово': { municipality: 'Болярово', ekatte: '05284' },
  'с. Воден': { municipality: 'Болярово', ekatte: '11658' },
  'с. Голямо Крушево': { municipality: 'Болярово', ekatte: '15881' },
  'с. Горска поляна': { municipality: 'Болярово', ekatte: '17097' },
  'с. Денница': { municipality: 'Болярово', ekatte: '20657' },
  'с. Дъбово': { municipality: 'Болярово', ekatte: '24356' },
  'с. Златиница': { municipality: 'Болярово', ekatte: '31019' },
  'с. Иглика': { municipality: 'Болярово', ekatte: '32264' },
  'с. Камен връх': { municipality: 'Болярово', ekatte: '35756' },
  'с. Крайново': { municipality: 'Болярово', ekatte: '39356' },
  'с. Малко Шарково': { municipality: 'Болярово', ekatte: '46704' },
  'с. Мамарчево': { municipality: 'Болярово', ekatte: '46958' },
  'с. Оман': { municipality: 'Болярово', ekatte: '53504' },
  'с. Попово': { municipality: 'Болярово', ekatte: '57652' },
  'с. Ружица': { municipality: 'Болярово', ekatte: '63272' },
  'с. Ситово': { municipality: 'Болярово', ekatte: '66679' },
  'с. Стефан Караджово': { municipality: 'Болярово', ekatte: '69208' },
  'с. Странджа': { municipality: 'Болярово', ekatte: '69674' },
  'с. Вълчи извор': { municipality: 'Болярово', ekatte: '12588' },

  // Община Елхово (21 населени места)
  'гр. Елхово': { municipality: 'Елхово', ekatte: '27382' },
  'с. Борисово': { municipality: 'Елхово', ekatte: '05520' },
  'с. Бояново': { municipality: 'Елхово', ekatte: '06001' },
  'с. Вълча поляна': { municipality: 'Елхово', ekatte: '12530' },
  'с. Гранитово': { municipality: 'Елхово', ekatte: '17748' },
  'с. Голям Дервент': { municipality: 'Елхово', ekatte: '15730' },
  'с. Добрич': { municipality: 'Елхово', ekatte: '21542' },
  'с. Жребино': { municipality: 'Елхово', ekatte: '29516' },
  'с. Изгрев': { municipality: 'Елхово', ekatte: '32576' },
  'с. Кирилово': { municipality: 'Елхово', ekatte: '36909' },
  'с. Лалково': { municipality: 'Елхово', ekatte: '43116' },
  'с. Лесово': { municipality: 'Елхово', ekatte: '43459' },
  'с. Маломирово': { municipality: 'Елхово', ekatte: '46797' },
  'с. Малко Кирилово': { municipality: 'Елхово', ekatte: '46615' },
  'с. Малък манастир': { municipality: 'Елхово', ekatte: '46904' },
  'с. Мелница': { municipality: 'Елхово', ekatte: '47768' },
  'с. Пчела': { municipality: 'Елхово', ekatte: '58801' },
  'с. Раздел': { municipality: 'Елхово', ekatte: '61738' },
  'с. Славейково': { municipality: 'Елхово', ekatte: '66980' },
  'с. Стройно': { municipality: 'Елхово', ekatte: '69883' },
  'с. Трънково': { municipality: 'Елхово', ekatte: '73328' },

  // Община Стралджа (20 населени места)
  'гр. Стралджа': { municipality: 'Стралджа', ekatte: '69660' },
  'с. Александрово': { municipality: 'Стралджа', ekatte: '00343' },
  'с. Атолово': { municipality: 'Стралджа', ekatte: '00816' },
  'с. Богорово': { municipality: 'Стралджа', ekatte: '04786' },
  'с. Воденичане': { municipality: 'Стралджа', ekatte: '11661' },
  'с. Войника': { municipality: 'Стралджа', ekatte: '11908' },
  'с. Джинот': { municipality: 'Стралджа', ekatte: '20804' },
  'с. Зимница': { municipality: 'Стралджа', ekatte: '30898' },
  'с. Каменец': { municipality: 'Стралджа', ekatte: '35794' },
  'с. Леярово': { municipality: 'Стралджа', ekatte: '43615' },
  'с. Лозенец': { municipality: 'Стралджа', ekatte: '44118' },
  'с. Люлин': { municipality: 'Стралджа', ekatte: '44666' },
  'с. Маленово': { municipality: 'Стралджа', ekatte: '46303' },
  'с. Недялско': { municipality: 'Стралджа', ekatte: '51384' },
  'с. Палаузово': { municipality: 'Стралджа', ekatte: '55244' },
  'с. Поляна': { municipality: 'Стралджа', ekatte: '57409' },
  'с. Правдино': { municipality: 'Стралджа', ekatte: '58003' },
  'с. Първенец': { municipality: 'Стралджа', ekatte: '59046' },
  'с. Саранско': { municipality: 'Стралджа', ekatte: '65406' },
  'с. Тамарино': { municipality: 'Стралджа', ekatte: '72076' },

  // Община Тунджа (40 населени места - продължение на стр. 2)
  'с. Асеново': { municipality: 'Тунджа', ekatte: '00758' },
  'с. Безмер': { municipality: 'Тунджа', ekatte: '03229' },
  'с. Болярско': { municipality: 'Тунджа', ekatte: '05308' },
  'с. Ботево': { municipality: 'Тунджа', ekatte: '05863' },
  'с. Бояджик': { municipality: 'Тунджа', ekatte: '05952' },
  'с. Веселиново': { municipality: 'Тунджа', ekatte: '10776' },
  'с. Видинци': { municipality: 'Тунджа', ekatte: '10985' },
  'с. Генерал Инзово': { municipality: 'Тунджа', ekatte: '32740' },
  'с. Генерал Тошево': { municipality: 'Тунджа', ekatte: '14725' },
  'с. Голям манастир': { municipality: 'Тунджа', ekatte: '15789' },
  'с. Гълъбинци': { municipality: 'Тунджа', ekatte: '18259' },
  'с. Дражево': { municipality: 'Тунджа', ekatte: '23501' },
  'с. Драма': { municipality: 'Тунджа', ekatte: '23557' },
  'с. Дряново': { municipality: 'Тунджа', ekatte: '23978' },
  'с. Завой': { municipality: 'Тунджа', ekatte: '30096' },
  'с. Златари': { municipality: 'Тунджа', ekatte: '30956' },
  'с. Кабиле': { municipality: 'Тунджа', ekatte: '35028' },
  'с. Калчево': { municipality: 'Тунджа', ekatte: '35609' },
  'с. Каравелово': { municipality: 'Тунджа', ekatte: '36200' },
  'с. Козарево': { municipality: 'Тунджа', ekatte: '37681' },
  'с. Коневец': { municipality: 'Тунджа', ekatte: '38279' },
  'с. Крумово': { municipality: 'Тунджа', ekatte: '40018' },
  'с. Кукорево': { municipality: 'Тунджа', ekatte: '40484' },
  'с. Маломир': { municipality: 'Тунджа', ekatte: '46783' },
  'с. Меден кладенец': { municipality: 'Тунджа', ekatte: '47562' },
  'с. Межда': { municipality: 'Тунджа', ekatte: '47682' },
  'с. Миладиновци': { municipality: 'Тунджа', ekatte: '48101' },
  'с. Могила': { municipality: 'Тунджа', ekatte: '48787' },
  'с. Овчи кладенец': { municipality: 'Тунджа', ekatte: '53299' },
  'с. Окоп': { municipality: 'Тунджа', ekatte: '53480' },
  'с. Победа': { municipality: 'Тунджа', ekatte: '56873' },
  'с. Робово': { municipality: 'Тунджа', ekatte: '62757' },
  'с. Роза': { municipality: 'Тунджа', ekatte: '62921' },
  'с. Савино': { municipality: 'Тунджа', ekatte: '65036' },
  'с. Симеоново': { municipality: 'Тунджа', ekatte: '66456' },
  'с. Скалица': { municipality: 'Тунджа', ekatte: '66737' },
  'с. Сламино': { municipality: 'Тунджа', ekatte: '67177' },
  'с. Стара река': { municipality: 'Тунджа', ekatte: '68878' },
  'с. Тенево': { municipality: 'Тунджа', ekatte: '72240' },

  // Община Ямбол - трябва да се вземе от стр. 2
  'гр. Ямбол': { municipality: 'Ямбол', ekatte: '87374' },
}`;

// Find and replace
const startIdx = lines.findIndex(l => l.includes('const YAMBOL_LOCALITIES'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l === '}');
const before = lines.slice(0, startIdx);
const after = lines.slice(endIdx + 1);
const newContent = [...before, newLocalities, ...after].join('\n');
fs.writeFileSync(path, newContent, 'utf8');
console.log('Updated with correct EKATTE data from ekatte.com');
