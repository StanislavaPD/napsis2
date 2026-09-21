const fs = require('fs');
const path = 'd:/New folder/napsis/src/components/Generators.tsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

const newLocalities = `const YAMBOL_LOCALITIES: Record<string, LocalityInfo> = {
  // Община Ямбол (22 населени места)
  'гр. Ямбол': { municipality: 'Ямбол', ekatte: '87374' },
  'с. Безмер': { municipality: 'Ямбол', ekatte: '03422' },
  'с. Бояново': { municipality: 'Ямбол', ekatte: '07292' },
  'с. Воден': { municipality: 'Ямбол', ekatte: '11849' },
  'с. Генерал Инзово': { municipality: 'Ямбол', ekatte: '15239' },
  'с. Генерал Тошево': { municipality: 'Ямбол', ekatte: '15293' },
  'с. Дишня': { municipality: 'Ямбол', ekatte: '21103' },
  'с. Кабиле': { municipality: 'Ямбол', ekatte: '35306' },
  'с. Калчево': { municipality: 'Ямбол', ekatte: '36283' },
  'с. Караново': { municipality: 'Ямбол', ekatte: '37255' },
  'с. Ловец': { municipality: 'Ямбол', ekatte: '44750' },
  'с. Мъдрец': { municipality: 'Ямбол', ekatte: '50409' },
  'с. Роза': { municipality: 'Ямбол', ekatte: '63206' },
  'с. Роженица': { municipality: 'Ямбол', ekatte: '63270' },
  'с. Скалица': { municipality: 'Ямбол', ekatte: '67260' },
  'с. Стара река': { municipality: 'Ямбол', ekatte: '69615' },
  'с. Стражица': { municipality: 'Ямбол', ekatte: '70326' },
  'с. Съединение': { municipality: 'Ямбол', ekatte: '72191' },
  'с. Хаджидимитрово': { municipality: 'Ямбол', ekatte: '77463' },
  'с. Черна могила': { municipality: 'Ямбол', ekatte: '80599' },
  'с. Златари': { municipality: 'Ямбол', ekatte: '30283' },
  'с. Зимница': { municipality: 'Ямбол', ekatte: '30502' },

  // Община Болярово (8 населени места)
  'гр. Болярово': { municipality: 'Болярово', ekatte: '05130' },
  'с. Борисово': { municipality: 'Болярово', ekatte: '06358' },
  'с. Камено': { municipality: 'Болярово', ekatte: '36606' },
  'с. Оряхово': { municipality: 'Болярово', ekatte: '55115' },
  'с. Попово': { municipality: 'Болярово', ekatte: '59145' },
  'с. Сираково': { municipality: 'Болярово', ekatte: '66831' },
  'с. Стефан Караджово': { municipality: 'Болярово', ekatte: '70038' },
  'с. Щит': { municipality: 'Болярово', ekatte: '85319' },

  // Община Елхово (19 населени места)
  'гр. Елхово': { municipality: 'Елхово', ekatte: '24067' },
  'с. Голям Манастир': { municipality: 'Елхово', ekatte: '16611' },
  'с. Голям Дервент': { municipality: 'Елхово', ekatte: '16388' },
  'с. Гранитово': { municipality: 'Елхово', ekatte: '17681' },
  'с. Група': { municipality: 'Елхово', ekatte: '18317' },
  'с. Долно Ботево': { municipality: 'Елхово', ekatte: '22028' },
  'с. Изгрев': { municipality: 'Елхово', ekatte: '33409' },
  'с. Кирилово': { municipality: 'Елхово', ekatte: '39142' },
  'с. Лалково': { municipality: 'Елхово', ekatte: '43456' },
  'с. Лесово': { municipality: 'Елхово', ekatte: '44120' },
  'с. Маленово': { municipality: 'Елхово', ekatte: '46695' },
  'с. Мелница': { municipality: 'Елхово', ekatte: '48168' },
  'с. Пъстрогор': { municipality: 'Елхово', ekatte: '60986' },
  'с. Раздел': { municipality: 'Елхово', ekatte: '61642' },
  'с. Сафарево': { municipality: 'Елхово', ekatte: '65375' },
  'с. Симеоново': { municipality: 'Елхово', ekatte: '66621' },
  'с. Стройно': { municipality: 'Елхово', ekatte: '70750' },
  'с. Трънково': { municipality: 'Елхово', ekatte: '74024' },
  'с. Чернозем': { municipality: 'Елхово', ekatte: '80844' },

  // Община Стралджа (19 населени места)
  'гр. Стралджа': { municipality: 'Стралджа', ekatte: '70474' },
  'с. Александрово': { municipality: 'Стралджа', ekatte: '00611' },
  'с. Атанасово': { municipality: 'Стралджа', ekatte: '02257' },
  'с. Воденичане': { municipality: 'Стралджа', ekatte: '11628' },
  'с. Завой': { municipality: 'Стралджа', ekatte: '28859' },
  'с. Зимница': { municipality: 'Стралджа', ekatte: '30488' },
  'с. Иречеково': { municipality: 'Стралджа', ekatte: '34135' },
  'с. Козарево': { municipality: 'Стралджа', ekatte: '40467' },
  'с. Кула': { municipality: 'Стралджа', ekatte: '42826' },
  'с. Маглен': { municipality: 'Стралджа', ekatte: '45887' },
  'с. Младово': { municipality: 'Стралджа', ekatte: '49324' },
  'с. Палаузово': { municipality: 'Стралджа', ekatte: '56141' },
  'с. Правдино': { municipality: 'Стралджа', ekatte: '59616' },
  'с. Сакарци': { municipality: 'Стралджа', ekatte: '64558' },
  'с. Съединение': { municipality: 'Стралджа', ekatte: '72202' },
  'с. Тенево': { municipality: 'Стралджа', ekatte: '72917' },
  'с. Тополчане': { municipality: 'Стралджа', ekatte: '73445' },
  'с. Чарда': { municipality: 'Стралджа', ekatte: '79537' },
  'с. Шейново': { municipality: 'Стралджа', ekatte: '84206' },

  // Община Тунджа (14 населени места)
  'с. Асеново': { municipality: 'Тунджа', ekatte: '02042' },
  'с. Веселиново': { municipality: 'Тунджа', ekatte: '10858' },
  'с. Драгново': { municipality: 'Тунджа', ekatte: '23064' },
  'с. Дражево': { municipality: 'Тунджа', ekatte: '23078' },
  'с. Каравелово': { municipality: 'Тунджа', ekatte: '37056' },
  'с. Кораво': { municipality: 'Тунджа', ekatte: '41603' },
  'с. Лозенец': { municipality: 'Тунджа', ekatte: '44883' },
  'с. Межда': { municipality: 'Тунджа', ekatte: '47885' },
  'с. Окоп': { municipality: 'Тунджа', ekatte: '53959' },
  'с. Робово': { municipality: 'Тунджа', ekatte: '63059' },
  'с. Савино': { municipality: 'Тунджа', ekatte: '64196' },
  'с. Симеоновец': { municipality: 'Тунджа', ekatte: '66631' },
  'с. Хайдушко': { municipality: 'Тунджа', ekatte: '77610' },
  'с. Чарган': { municipality: 'Тунджа', ekatte: '79507' },
}`;

// Find and replace
const startIdx = lines.findIndex(l => l.includes('const YAMBOL_LOCALITIES'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l === '}');
const before = lines.slice(0, startIdx);
const after = lines.slice(endIdx + 1);
const newContent = [...before, newLocalities, ...after].join('\n');
fs.writeFileSync(path, newContent, 'utf8');
console.log('Updated localities with EKATTE codes');
