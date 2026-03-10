# Document Loop — Compile Stories into Final Output

Read `.ralph-flow/03-document-loop/tracker.md` FIRST to determine where you are.

> **This is an on-demand loop.** Unlike discovery, research, and story loops, this loop runs once to produce the final document. It reads all completed stories and compiles them into the requested output format.

> **WRITE ONLY TO:** `03-document-loop/tracker.md`, and the output file(s) in the project directory.

**Pipeline:** `stories.md → YOU → final document (PDF, PPT, Markdown, etc.)`

---

## STAGE 1: COMPILE

1. **Read context:**
   - Read `00-discovery-loop/tracker.md` → get the Research Brief (audience, scope, output format)
   - Read `02-story-loop/stories.md` → all completed stories
   - Read `02-story-loop/tracker.md` → verify all stories are complete
   - Read `CLAUDE.md` for any project-specific context

2. **Determine output format** from the Research Brief. If not specified, use `AskUserQuestion`:
   - "What format should the final document be? (markdown/pdf/ppt/html)" with options
   - Also ask: "Any specific structure, branding, or style requirements?"

3. **Plan document structure:**
   - Executive summary / abstract
   - Table of contents
   - Arrange stories in logical reading order (not necessarily story-number order)
   - Add transitions between stories for narrative flow
   - Create introduction and conclusion that frame the overall research
   - Add appendices if needed (methodology notes, full source list, data tables)

4. **Write the document:**

   **For Markdown (.md):**
   - Write a single comprehensive markdown file to the project directory
   - Include all sections, proper heading hierarchy, citations

   **For HTML:**
   - Write a styled HTML file with clean, professional CSS
   - Include print-friendly styles for PDF conversion
   - Responsive layout suitable for reading

   **For PPT/Presentation:**
   - Write a structured markdown file optimized for presentation
   - Each major section = 1-3 slides
   - Key findings as bullet points, not paragraphs
   - Include speaker notes as HTML comments
   - Create a companion script or instructions for converting to actual PPT (e.g., using marp, pandoc, or similar)

   **For PDF:**
   - Write a well-structured markdown or HTML file optimized for PDF conversion
   - Include instructions for converting to PDF (pandoc, browser print, etc.)

5. **Compile source bibliography:**
   - Gather all sources from all findings
   - Deduplicate and format consistently
   - Add as appendix

6. **Update tracker:**
   - Record output file path, format, word count
   - Log completion
   - `<promise>DOCUMENT COMPLETE</promise>`

---

## Document Structure Template

```markdown
# {Research Title}

**Prepared by:** {from CLAUDE.md or user context}
**Date:** {current date}
**Audience:** {from research brief}

---

## Executive Summary
{2-3 paragraphs synthesizing the entire research. Key findings, implications, recommendations.}

## Table of Contents
{Auto-generated from section headers}

---

{Stories arranged in logical order, with transitions}

## Story Section 1: {title}
{Story content, refined for document context}

## Story Section 2: {title}
{Story content}

...

---

## Conclusions & Recommendations
{Cross-cutting insights that emerge from the stories together}

## Appendix A: Methodology
{Brief description of research approach}

## Appendix B: Sources
{Consolidated, deduplicated bibliography}
```

---

## Rules

- This runs ONCE, on-demand. It is not a recurring loop.
- Read ALL stories before writing — the document must be coherent as a whole.
- Respect the audience — adjust tone, depth, and jargon accordingly.
- The document should add value beyond just concatenating stories — add executive summary, transitions, cross-cutting analysis, and recommendations.
- Cite sources properly. Include a full bibliography.
- Write to the project root directory, not inside `.ralph-flow/`.
- If the user wants multiple formats, produce each one.

---

Read `.ralph-flow/03-document-loop/tracker.md` now and begin.
