# Словарь игры: источники и лицензия

Код «Словолова» открыт только для некоммерческого использования — лицензия PolyForm Noncommercial 1.0.0 (файл
`LICENSE.md` в корне репозитория). У словаря — свои условия, потому что он собран из чужих открытых данных.

## nouns_ru.tsv

Список русских существительных с оценкой «ходовости» слова. Собирается скриптом `tools/build_dictionary.py` из:

| Что взято | Источник | Лицензия |
| --- | --- | --- |
| Сами слова (существительные в начальной форме) | [Harrix/Russian-Nouns](https://github.com/Harrix/Russian-Nouns) | MIT, © 2018-present Sergienko Anton |
| Частоты слов в разговорной речи | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), список `2018/ru` по корпусу [OpenSubtitles2018](http://opus.nlpl.eu/OpenSubtitles2018.php) | CC BY-SA 4.0 |
| Частоты слов в книгах | [Digital-Pushkin-Lab/Russian_frequency_lists](https://github.com/Digital-Pushkin-Lab/Russian_frequency_lists), список по корпусу русской детской литературы DetCorpus | CC0 1.0 |
| Морфология (к какому слову отнести словоформу) | [pymorphy3](https://github.com/no-plagiarism/pymorphy3) со словарями [OpenCorpora](https://opencorpora.org) | MIT (код), CC BY-SA 3.0 (словари) |

В файл попадают слова из первого источника, слова из двух списков, набранных вручную (`tools/extra_nouns.txt` и
`tools/more_nouns.txt` — то, чего в первом источнике не хватает), и числа, посчитанные по остальным источникам; тексты
корпусов и сами списки частот в нём не воспроизводятся.

**Лицензия файла `nouns_ru.tsv` — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ru)**: этого требует
условие «распространять на тех же условиях» у частотных списков. Словарь можно свободно использовать, менять и
распространять, в том числе вместе с программами под другой лицензией, если указать источники из таблицы выше и
оставить за изменённым словарём ту же лицензию.

Уведомление MIT для списка слов Harrix/Russian-Nouns:

> Copyright © 2018-present Sergienko Anton
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Остальные списки

`blocklist.txt` в этой папке и `extra_nouns.txt`, `more_nouns.txt`, `not_common.txt`, `not_in_cells.txt` в `tools/`
составлены для «Словолова» вручную и распространяются на тех же условиях, что и код.
