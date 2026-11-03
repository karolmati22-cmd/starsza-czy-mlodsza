#!/bin/sh
# Dopisuje do index.html wersję plików gry.js i gry.css (skrót ich zawartości),
# żeby przeglądarka nie mieszała nowej strony ze starymi plikami z pamięci podręcznej.
cd "$(dirname "$0")/.." || exit 1
js=$(md5sum gry.js | cut -c1-8)
css=$(md5sum gry.css | cut -c1-8)
sed -i -E "s#gry\.js(\?v=[0-9a-f]+)?\"#gry.js?v=$js\"#; s#gry\.css(\?v=[0-9a-f]+)?\"#gry.css?v=$css\"#" index.html
grep -o 'gry\.\(js\|css\)?v=[0-9a-f]*' index.html
