export interface ParsedTopic {
  name: string;
}

export interface ParsedSubject {
  name: string;
  topics: ParsedTopic[];
}

export interface ParsedSyllabus {
  subjects: ParsedSubject[];
  /** Lines the parser could not place, surfaced so nothing is silently dropped. */
  unmatchedLines: string[];
}

/** Bullets and numbering that mark a line as a topic rather than a heading. */
const LIST_MARKER =
  /^\s*(?:[-–—•*·◦]|\(?\d{1,3}[.)]|\(?[a-z][.)]|\(?[ivxlcdm]{1,5}[.)])\s+/i;

const HEADING_KEYWORD = /^\s*(paper|section|part|subject|unit|module|group)\b/i;

/** Page furniture that would otherwise become spurious topics. */
const NOISE =
  /^\s*(page\s*\d+(\s*(of|\/)\s*\d+)?|\d+\s*(of|\/)\s*\d+|[-–—_=.\s]{3,}|syllabus|contents?|index)\s*$/i;

function isAllCaps(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

function clean(line: string): string {
  return line
    // Leading bullet or numbering.
    .replace(LIST_MARKER, '')
    // Dotted leaders from a contents page: "Percentage .......... 14"
    .replace(/[.\s]{4,}\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Trailing punctuation left over from list formatting.
    .replace(/[;,:]$/, '')
    .trim();
}

/**
 * Turns raw syllabus text into a subject/topic tree.
 *
 * Syllabus documents are wildly inconsistent, so this is a best effort and the
 * student always reviews the result before it is applied. The rules, in order:
 *
 *  1. "Subject: a, b, c" on one line becomes a subject with three topics.
 *  2. A bulleted or numbered line is a topic under the current subject.
 *  3. An unbulleted line is a heading if it is ALL CAPS, starts with a word like
 *     "Paper"/"Unit", ends in a colon, or is followed by a bulleted line.
 *  4. Anything left over is reported rather than dropped, so the student can see
 *     what the parser could not place.
 */
export function parseSyllabus(rawText: string, fallbackSubjectName: string): ParsedSyllabus {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !NOISE.test(line));

  const subjects: ParsedSubject[] = [];
  const unmatchedLines: string[] = [];
  let current: ParsedSubject | null = null;

  const startSubject = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = subjects.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    current = existing ?? { name: trimmed, topics: [] };
    if (!existing) subjects.push(current);
  };

  const addTopic = (name: string) => {
    const trimmed = clean(name);
    // Single characters and stray numbers are formatting debris, not topics.
    if (trimmed.length < 2 || /^\d+$/.test(trimmed)) return;
    if (!current) startSubject(fallbackSubjectName);
    if (!current) return;
    if (current.topics.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    current.topics.push({ name: trimmed });
  };

  for (const [index, line] of lines.entries()) {
    const hasMarker = LIST_MARKER.test(line);
    const body = clean(line);
    if (!body) continue;

    // Rule 1: "Quantitative Aptitude: Number System, Percentage, ..."
    const inlineList = /^([^:]{2,60}):\s*(.+)$/.exec(body);
    if (!hasMarker && inlineList?.[1] && inlineList[2] && inlineList[2].includes(',')) {
      startSubject(inlineList[1]);
      for (const part of inlineList[2].split(/[,;]/)) addTopic(part);
      continue;
    }

    // Rule 2: an explicit bullet or number is always a topic.
    if (hasMarker) {
      addTopic(body);
      continue;
    }

    // Rule 3: heading heuristics.
    const nextLine = lines[index + 1];
    const nextIsTopic = nextLine !== undefined && LIST_MARKER.test(nextLine);
    const endsWithColon = /:$/.test(line);
    const looksLikeHeading =
      isAllCaps(body) || HEADING_KEYWORD.test(body) || endsWithColon || nextIsTopic;

    // A heading should be short; a long sentence is prose, not a subject name.
    if (looksLikeHeading && body.length <= 60) {
      startSubject(body.replace(/:$/, ''));
      continue;
    }

    // Rule 4: plain line inside a subject is a topic; outside one, it is unplaced.
    if (current) {
      addTopic(body);
    } else {
      unmatchedLines.push(body);
    }
  }

  // Nothing looked like a heading: treat every unplaced line as a topic under a
  // single subject rather than returning an empty result.
  if (subjects.length === 0 && unmatchedLines.length > 0) {
    startSubject(fallbackSubjectName);
    for (const line of unmatchedLines.splice(0)) addTopic(line);
  }

  return {
    subjects: subjects.filter((subject) => subject.topics.length > 0),
    unmatchedLines,
  };
}
