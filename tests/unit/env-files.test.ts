import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  loadEnvFiles,
  parseEnvFile,
  resetLoadedEnvFiles
} from '../../shared/node/env-files'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-env-'))
  resetLoadedEnvFiles()
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  resetLoadedEnvFiles()
})

async function writeEnv(filename: string, contents: string): Promise<void> {
  await writeFile(join(root, filename), contents, 'utf8')
}

describe('env file parsing', () => {
  it('reads simple key/value pairs', () => {
    expect(parseEnvFile('A=1\nB=two')).toEqual([
      ['A', '1'],
      ['B', 'two']
    ])
  })

  it('ignores comments, blank lines, and malformed lines', () => {
    const parsed = parseEnvFile(
      ['# comment', '', '  ', 'NOT_A_PAIR', '=novalue', 'OK=yes'].join('\n')
    )

    expect(parsed).toEqual([['OK', 'yes']])
  })

  it('strips an optional export prefix', () => {
    expect(parseEnvFile('export TOKEN=abc')).toEqual([['TOKEN', 'abc']])
  })

  it('keeps a value that contains an equals sign', () => {
    expect(parseEnvFile('URL=https://x.test/?a=1&b=2')).toEqual([
      ['URL', 'https://x.test/?a=1&b=2']
    ])
  })

  it('strips surrounding quotes', () => {
    expect(parseEnvFile(`A="double"\nB='single'`)).toEqual([
      ['A', 'double'],
      ['B', 'single']
    ])
  })

  it('expands escapes inside double quotes but not single quotes', () => {
    expect(parseEnvFile('A="line\\nbreak"')).toEqual([['A', 'line\nbreak']])
    expect(parseEnvFile("B='line\\nbreak'")).toEqual([['B', 'line\\nbreak']])
  })

  it('strips an unquoted trailing comment but keeps a quoted hash', () => {
    expect(parseEnvFile('A=value # note')).toEqual([['A', 'value']])
    expect(parseEnvFile('B="value # not a comment"')).toEqual([
      ['B', 'value # not a comment']
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual([
      ['A', '1'],
      ['B', '2']
    ])
  })

  it('allows an empty value', () => {
    expect(parseEnvFile('A=')).toEqual([['A', '']])
  })
})

describe('env file loading', () => {
  it('sets variables that are not already in the environment', async () => {
    await writeEnv('.env', 'FRAMEFOLIO_ADMIN_PASSWORD=from-env\n')
    const environment: NodeJS.ProcessEnv = {}

    const { applied } = loadEnvFiles({ directory: root, environment })

    expect(environment.FRAMEFOLIO_ADMIN_PASSWORD).toBe('from-env')
    expect(applied).toEqual(['FRAMEFOLIO_ADMIN_PASSWORD'])
  })

  it('never overrides a real environment variable', async () => {
    // The container sets these; a stray file must not be able to change them.
    await writeEnv('.env', 'FRAMEFOLIO_ADMIN_PASSWORD=from-file\n')
    const environment: NodeJS.ProcessEnv = {
      FRAMEFOLIO_ADMIN_PASSWORD: 'from-process'
    }

    const { skipped } = loadEnvFiles({ directory: root, environment })

    expect(environment.FRAMEFOLIO_ADMIN_PASSWORD).toBe('from-process')
    expect(skipped).toEqual(['FRAMEFOLIO_ADMIN_PASSWORD'])
  })

  it('lets .env.local override .env', async () => {
    await writeEnv('.env', 'FRAMEFOLIO_ADMIN_PASSWORD=shared\n')
    await writeEnv('.env.local', 'FRAMEFOLIO_ADMIN_PASSWORD=personal\n')
    const environment: NodeJS.ProcessEnv = {}

    loadEnvFiles({ directory: root, environment })

    expect(environment.FRAMEFOLIO_ADMIN_PASSWORD).toBe('personal')
  })

  it('still lets .env.local override a value Nuxt copied from .env', async () => {
    // This is the real dev scenario: Nuxt has already put .env into
    // process.env, so "the key exists" cannot mean "a human set it".
    await writeEnv('.env', 'FRAMEFOLIO_ADMIN_PASSWORD=shared\n')
    await writeEnv('.env.local', 'FRAMEFOLIO_ADMIN_PASSWORD=personal\n')
    const environment: NodeJS.ProcessEnv = {
      FRAMEFOLIO_ADMIN_PASSWORD: 'shared'
    }

    loadEnvFiles({ directory: root, environment })

    expect(environment.FRAMEFOLIO_ADMIN_PASSWORD).toBe('personal')
  })

  it('does not let .env.local beat a real environment variable', async () => {
    await writeEnv('.env', 'FRAMEFOLIO_ADMIN_PASSWORD=shared\n')
    await writeEnv('.env.local', 'FRAMEFOLIO_ADMIN_PASSWORD=personal\n')
    const environment: NodeJS.ProcessEnv = {
      FRAMEFOLIO_ADMIN_PASSWORD: 'from-process'
    }

    loadEnvFiles({ directory: root, environment })

    expect(environment.FRAMEFOLIO_ADMIN_PASSWORD).toBe('from-process')
  })

  it('honours a production file list that excludes .env.local', async () => {
    await writeEnv('.env', 'FRAMEFOLIO_ADMIN_PASSWORD=production\n')
    await writeEnv('.env.local', 'FRAMEFOLIO_ADMIN_PASSWORD=developer\n')
    const environment: NodeJS.ProcessEnv = {}

    loadEnvFiles({
      directory: root,
      filenames: ['.env'],
      environment
    })

    expect(environment.FRAMEFOLIO_ADMIN_PASSWORD).toBe('production')
  })

  it('ignores missing files without throwing', async () => {
    const environment: NodeJS.ProcessEnv = {}

    const result = loadEnvFiles({ directory: root, environment })

    expect(result.applied).toEqual([])
    expect(environment).toEqual({})
  })

  it('keeps a key that only exists in .env.local', async () => {
    await writeEnv('.env', 'A=1\n')
    await writeEnv('.env.local', 'B=2\n')
    const environment: NodeJS.ProcessEnv = {}

    loadEnvFiles({ directory: root, environment })

    expect(environment).toEqual({ A: '1', B: '2' })
  })
})
