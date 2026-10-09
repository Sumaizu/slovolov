import csv
import math
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
CACHE = TOOLS / "_cache"
OUTPUT = TOOLS.parent / "site" / "data" / "nouns_ru.tsv"
SOURCES = {
    "russian_nouns.txt": "https://raw.githubusercontent.com/Harrix/Russian-Nouns/main/dist/russian_nouns.txt",
    "ru_full.txt": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_full.txt",
    "detcorpus_50000.csv": "https://raw.githubusercontent.com/Digital-Pushkin-Lab/Russian_frequency_lists/main/"
                           "wordlist_detcorpus_50000.csv",
}
RUSSIAN_LETTERS = set("абвгдеёжзийклмнопрстуфхцчшщъыьэюя")
PROPER_NAME_TAGS = {"Name", "Surn", "Patr", "Geox", "Orgn", "Trad", "Abbr", "Init"}
MIN_FORM_COUNT = 2
MIN_FREQUENCY = 0.03
WELL_KNOWN_SCORE = 3.0
NOT_HIDDEN_SCORE = 0.02
NEVER_SHOWN_SCORE = 0.01
SPELLED_WITH_YO = {"лён", "манёвр", "манёвренность", "вахтёр", "вахтёрша", "комбайнёр", "комбайнёрка", "стартёр",
                   "берёста", "дрёма", "тёрн", "жёлчь", "жёлчность"}


def norm(word):
    return word.lower().replace("ё", "е")


def is_common_noun(parse):
    return "NOUN" in parse.tag and not PROPER_NAME_TAGS & set(parse.tag.grammemes)


def download_sources():
    CACHE.mkdir(exist_ok=True)
    for name, url in SOURCES.items():
        target = CACHE / name
        if not target.exists():
            print(f"скачиваю {name} …", flush=True)
            urllib.request.urlretrieve(url, target)


def read_word_list(name):
    words = {}
    for line in (TOOLS / name).read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].replace(".", "", 1).isdigit():
            words[norm(parts[0])] = (parts[0].lower(), float(parts[1]))
        else:
            words.update((norm(word), (word.lower(), None)) for word in parts)
    return words


def subtitle_frequencies(morph):
    counts, total, parsed, started = defaultdict(float), 0, 0, time.time()
    with open(CACHE / "ru_full.txt", encoding="utf-8") as lines:
        for line in lines:
            form, _, count = line.rstrip("\n").rpartition(" ")
            if not count.isdigit():
                continue
            count = int(count)
            total += count
            if count < MIN_FORM_COUNT or not form or not set(form) <= RUSSIAN_LETTERS:
                continue
            parses = morph.parse(form)
            weight = sum(parse.score for parse in parses) or 1.0
            for parse in parses:
                if is_common_noun(parse):
                    counts[norm(parse.normal_form)] += count * parse.score / weight
            parsed += 1
            if parsed % 200000 == 0:
                print(f"  субтитры: разобрано словоформ {parsed} ({time.time() - started:.0f} с)", flush=True)
    per_million = 1_000_000 / max(1, total)
    return {word: count * per_million for word, count in counts.items()}


def book_frequencies():
    counts, corpus_millions = defaultdict(int), 0.0
    with open(CACHE / "detcorpus_50000.csv", encoding="utf-8-sig", newline="") as table:
        for number, row in enumerate(csv.reader(table)):
            if number == 0 or len(row) < 3:
                continue
            counts[norm(row[0].strip())] += int(row[1])
            if not corpus_millions and float(row[2]) > 0:
                corpus_millions = int(row[1]) / float(row[2])
    return {word: count / corpus_millions for word, count in counts.items()}


def is_better_spelling(word, known):
    if known is None or word in SPELLED_WITH_YO:
        return True
    return "ё" in known and known not in SPELLED_WITH_YO and "ё" not in word


def source_nouns(morph):
    spelling, rejected = {}, 0
    for word in (CACHE / "russian_nouns.txt").read_text(encoding="utf-8").split():
        word = word.strip().lower()
        if len(word) < 2 or not set(word) <= RUSSIAN_LETTERS:
            continue
        key = norm(word)
        parses = morph.parse(word)
        if morph.word_is_known(word) and not any(is_common_noun(p) and norm(p.normal_form) == key for p in parses):
            rejected += 1
            continue
        if is_better_spelling(word, spelling.get(key)):
            spelling[key] = word
    return spelling, rejected


def main():
    try:
        import pymorphy3
    except ImportError:
        sys.exit("нужен pymorphy3: pip install pymorphy3 pymorphy3-dicts-ru")
    download_sources()
    morph = pymorphy3.MorphAnalyzer()
    spoken, written = subtitle_frequencies(morph), book_frequencies()
    spelling, rejected = source_nouns(morph)
    well_known, more = read_word_list("extra_nouns.txt"), read_word_list("more_nouns.txt")
    not_hidden, never_shown = read_word_list("not_common.txt"), read_word_list("not_in_cells.txt")
    added = [key for key in list(well_known) + list(more) if key not in spelling]
    for key, (word, _) in list(well_known.items()) + list(more.items()):
        spelling.setdefault(key, word)
    excluded = [key for key in read_word_list("not_words.txt") if spelling.pop(key, None)]

    rows = []
    for key, word in spelling.items():
        score = math.sqrt(max(spoken.get(key, 0.0), MIN_FREQUENCY) * max(written.get(key, 0.0), MIN_FREQUENCY))
        if key in well_known:
            score = max(score, well_known[key][1] or WELL_KNOWN_SCORE)
        elif key in more and more[key][1] is not None:
            score = more[key][1]
        if key in not_hidden:
            score = NOT_HIDDEN_SCORE
        if key in never_shown:
            score = NEVER_SHOWN_SCORE
        rows.append((word, score))
    rows.sort(key=lambda row: (-row[1], row[0]))
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as output:
        output.writelines(f"{word}\t{score:.3f}\n" for word, score in rows)

    print(f"готово: {OUTPUT} — {len(rows)} слов")
    print(f"  добавлено из своих списков: {len(set(added))}; отброшено не-существительных: {rejected}")
    print(f"  убрано уменьшительных и прилагательных: {len(excluded)}")
    for threshold in (5, 1.5, 0.5):
        print(f"  оценка от {threshold}: {sum(score >= threshold for _, score in rows)} слов")


if __name__ == "__main__":
    main()
