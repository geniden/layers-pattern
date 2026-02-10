// tests/run-all.js — Запуск всех изолированных тестов LAYERS
//
// ИСПОЛЬЗОВАНИЕ:
//   node tests/run-all.js
//
// ПРИНЦИП LAYERS:
//   Каждый слой тестируется ОТДЕЛЬНО, БЕЗ зависимостей.
//   Входные данные = snapshot (из LAYER.md / snapshot-истории)
//   Выходные данные = delta (проверяется на корректность)
//
//   AI-агент может:
//   1. Прочитать LAYER.md → понять контракт слоя
//   2. Написать/модифицировать код слоя
//   3. Запустить тест → убедиться что всё работает
//   4. Использовать snapshot-историю для реалистичных тестовых данных

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'test-player-layer.js',
  'test-item-layer.js',
  'test-game-logic-layer.js'
];

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  LAYERS — Изолированное тестирование слоёв           ║');
console.log('║                                                       ║');
console.log('║  Принцип: snapshot → layer.tick() → delta             ║');
console.log('║  Каждый слой = чистая функция, без зависимостей       ║');
console.log('╚══════════════════════════════════════════════════════╝');

let totalFailed = 0;
const results = [];

for (const testFile of tests) {
  const filePath = path.join(__dirname, testFile);
  try {
    const output = execSync(`node "${filePath}"`, {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..'),
      timeout: 10000
    });
    console.log(output);
    results.push({ file: testFile, status: 'PASS' });
  } catch (err) {
    // Test failed but still ran — show output
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    totalFailed++;
    results.push({ file: testFile, status: 'FAIL' });
  }
}

// ── Итоговый отчёт ──
console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  ИТОГО                                               ║');
console.log('╠══════════════════════════════════════════════════════╣');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`║  ${icon} ${r.file.padEnd(35)} ${r.status.padEnd(10)}  ║`);
}
console.log('╠══════════════════════════════════════════════════════╣');
if (totalFailed === 0) {
  console.log('║  🎉 Все тесты пройдены!                               ║');
} else {
  console.log(`║  ⚠️  Провалено тестовых файлов: ${totalFailed}                       ║`);
}
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');

process.exit(totalFailed > 0 ? 1 : 0);
