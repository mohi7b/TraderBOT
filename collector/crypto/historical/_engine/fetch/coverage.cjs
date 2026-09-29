function mergeCoverage(ranges) {
    const merged = [];
    for (const range of [...ranges].sort((left, right) => left.startTime - right.startTime)) {
        if (!Number.isInteger(range.startTime) || !Number.isInteger(range.endTime) || range.endTime < range.startTime) throw new RangeError("Invalid coverage range");
        const previous = merged[merged.length - 1];
        if (!previous || range.startTime > previous.endTime + 1) merged.push({ ...range });
        else previous.endTime = Math.max(previous.endTime, range.endTime);
    }
    return merged;
}

function getGaps(ranges, startTime, endTime) {
    if (!Number.isInteger(startTime) || !Number.isInteger(endTime) || endTime < startTime) throw new RangeError("Invalid coverage bounds");
    const gaps = [];
    let cursor = startTime;
    for (const range of mergeCoverage(ranges)) {
        if (range.endTime < startTime || range.startTime > endTime) continue;
        const boundedStart = Math.max(startTime, range.startTime);
        const boundedEnd = Math.min(endTime, range.endTime);
        if (boundedStart > cursor) gaps.push({ startTime: cursor, endTime: boundedStart - 1 });
        cursor = Math.max(cursor, boundedEnd + 1);
    }
    if (cursor <= endTime) gaps.push({ startTime: cursor, endTime });
    return gaps;
}

module.exports = { getGaps, mergeCoverage };