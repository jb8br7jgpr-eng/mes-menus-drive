// V41.18 — coherences d'intitules sans modification des donnees.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const stock=readFileSync(new URL('../stock-ui-v41.mjs',import.meta.url),'utf8');
const freezer=readFileSync(new URL('../stock-week-v41.mjs',import.meta.url),'utf8');

test('Repas commande est nomme pareil dans menus, stock et erreurs',()=>{
 assert.match(app,/🍕 Repas commandé/);
 assert.match(stock,/🍕 Repas commandé/);
 assert.doesNotMatch(stock,/Repas libre ou commandé/);
 assert.match(freezer,/« Repas commandé »/);
 assert.doesNotMatch(freezer,/« Repas libre »/);
});
test('Le catalogue ne presente plus les achats du quotidien comme courses uniquement',()=>{
 assert.match(app,/Un achat du quotidien peut aussi compléter une recette ou un repas/);
 assert.match(app,/Courses, recettes et repas/);
 assert.doesNotMatch(app,/Quotidien : courses uniquement/);
 assert.doesNotMatch(app,/Choisis si ce produit pourra apparaître dans tes recettes/);
});
