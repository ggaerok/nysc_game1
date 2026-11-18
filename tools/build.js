// game/game.html 을 만든다: src/game.template.html + matter-js + src/gate_game.js 를 한 파일로 합친다.
// 사용: npm install && npm run build:game   (결과 game/game.html 은 저장소에 함께 올려 둔다)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let matter = fs.readFileSync(path.join(root, 'node_modules/matter-js/build/matter.min.js'), 'utf8');
matter = matter.replace(/\/\/# sourceMappingURL=.*$/m, '');
const gate = fs.readFileSync(path.join(root, 'src/gate_game.js'), 'utf8');
for (const [name, text] of [['matter', matter], ['gate', gate]]) {
  if (text.includes('</script')) throw new Error(name + ' contains </script');
}
const tpl = fs.readFileSync(path.join(root, 'src/game.template.html'), 'utf8');
const out = tpl.replace('/*MATTER_JS*/', () => matter).replace('/*GATE_JS*/', () => gate);
fs.mkdirSync(path.join(root, 'game'), { recursive: true });
fs.writeFileSync(path.join(root, 'game/game.html'), out);
console.log('built game/game.html', (out.length / 1024).toFixed(0) + ' KB');
