const MACHINE_DIRECTIVES = [
  /^\s*eslint(?:-disable|-enable|\s)/,
  /^\s*(?:globals?|exported)\s/,
  /^\s*@ts-(?:expect-error|ignore|nocheck|check)\b/,
  /^\/\s*<reference\s/,
  /^\s*@vite-ignore\s*$/,
  /^\s*[#@]__(?:PURE|NO_SIDE_EFFECTS)__\s*$/,
  /^\s*@vitest-environment\s/,
  /^\s*keeps:\s*\S/,
]

const PLATFORM_TAG = /^\s*platform:\s*\S/

const isAllowedComment = comment =>
  comment.type === 'Shebang' ||
  MACHINE_DIRECTIVES.some(pattern => pattern.test(comment.value)) ||
  (PLATFORM_TAG.test(comment.value) && !comment.value.includes('\n'))

const isBlank = text => /^[ \t]*$/.test(text)
const isIdentifierChar = char => /[\w$]/.test(char ?? '')
const OPENS_BLOCK = /[{([]\s*$/
const CLOSES_BLOCK = /^\s*(?:[})\]]|<\/)/

function lineAround(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1
  const newline = text.indexOf('\n', index)
  return { start, end: newline === -1 ? text.length : newline }
}

function removalRange(sourceCode, comment) {
  const { text } = sourceCode
  let [start, end] = comment.range
  const node = sourceCode.getNodeByRangeIndex(start)
  const container = node?.type === 'JSXEmptyExpression' ? node.parent : null
  if (container?.type === 'JSXExpressionContainer') {
    const inside = sourceCode.getAllComments().filter(other => other.range[0] >= container.range[0] && other.range[1] <= container.range[1])
    if (inside.every(other => !isAllowedComment(other))) [start, end] = container.range
  }

  const first = lineAround(text, start)
  const last = lineAround(text, end)
  const before = text.slice(first.start, start)
  const after = text.slice(end, last.end)

  if (isBlank(before) && isBlank(after)) {
    let removeStart = first.start
    let removeEnd = last.end < text.length ? last.end + 1 : last.end
    const previous = first.start === 0 ? null : lineAround(text, first.start - 1)
    const previousText = previous ? text.slice(previous.start, previous.end) : ''
    const next = removeEnd < text.length ? lineAround(text, removeEnd) : null
    const nextText = next ? text.slice(next.start, next.end) : ''
    const previousIsBlank = !previous || isBlank(previousText)
    if (previous && next && /\{\s*$/.test(previousText) && /^\s*\}/.test(nextText)) {
      removeStart = previous.end
      removeEnd = next.start + nextText.indexOf('}')
    } else if (next && isBlank(nextText) && (previousIsBlank || OPENS_BLOCK.test(previousText))) {
      removeEnd = next.end < text.length ? next.end + 1 : next.end
    } else if (previous && isBlank(previousText) && next && CLOSES_BLOCK.test(nextText)) {
      removeStart = previous.start
    }
    return { range: [removeStart, removeEnd], replacement: '' }
  }

  if (isBlank(after)) {
    let trimmedStart = start
    while (trimmedStart > first.start && /[ \t]/.test(text[trimmedStart - 1])) trimmedStart--
    return { range: [trimmedStart, end], replacement: '' }
  }

  let trimmedEnd = end
  while (trimmedEnd < last.end && /[ \t]/.test(text[trimmedEnd])) trimmedEnd++
  const spansLines = text.slice(start, end).includes('\n')
  const joinsTokens = isIdentifierChar(text[start - 1]) && isIdentifierChar(text[trimmedEnd])
  return { range: [start, trimmedEnd], replacement: spansLines ? '\n' : joinsTokens ? ' ' : '' }
}

const noComments = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: {
      banned: 'Delete this comment. Say it with a name, a type, or a test instead. Tag a constraint that a browser, vendor, or protocol forces on us as one line: `// platform: <reason>`.',
    },
  },
  create(context) {
    const { sourceCode } = context
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (isAllowedComment(comment)) continue
          context.report({
            loc: comment.loc,
            messageId: 'banned',
            fix: fixer => {
              const { range, replacement } = removalRange(sourceCode, comment)
              return fixer.replaceTextRange(range, replacement)
            },
          })
        }
      },
    }
  },
}

export default {
  meta: { name: 'my151' },
  rules: { 'no-comments': noComments },
}
