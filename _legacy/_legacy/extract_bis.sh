#!/bin/bash

SRC="collector/macro/offline/bis"
DST="collector/macro/offline/bis_extracted"

mkdir -p "$DST"

for f in $SRC/*csv_*.zip; do
    echo "Extracting: $f"
    unzip -o "$f" -d "$DST"
done
