import fs from 'node:fs'
import path from 'node:path'

import { execa, execaCommand } from 'execa'
import lionFixture from 'lion-fixture'
import { beforeAll, describe, expect, test } from 'vitest'

const { fixture, fixturesDir } = lionFixture(import.meta.url)

let tempFixturePath: string
let originalFixturePath: string
beforeAll(async () => {
	tempFixturePath = await fixture('typescript-project')
	originalFixturePath = path.join(fixturesDir, 'typescript-project')
})

describe('works with a TypeScript project', async () => {
	test('eslint works', async () => {
		await execaCommand('pnpm exec eslint --fix .', {
			cwd: tempFixturePath,
			stdio: 'inherit',
		})

		expect(
			fs
				.readFileSync(path.join(tempFixturePath, 'package.json'))
				.includes('  '),
			'package.json should not be formatted by `eslint-plugin-jsonc` with two-space indentation'
		).toBe(false)

		expect(
			fs.readFileSync(
				path.join(tempFixturePath, 'generated/should-not-be-formatted.ts'),
				'utf8'
			)
		).toEqual(
			fs.readFileSync(
				path.join(tempFixturePath, 'generated/should-not-be-formatted.ts'),
				'utf8'
			)
		)

		expect(
			fs.readFileSync(
				path.join(tempFixturePath, 'not-generated/should-be-formatted.ts'),
				'utf8'
			)
		).not.toEqual(
			fs.readFileSync(
				path.join(originalFixturePath, 'not-generated/should-be-formatted.ts'),
				'utf8'
			)
		)

		// ESLint's Prettier should not format with default options
		expect(
			fs.readFileSync(path.join(tempFixturePath, 'src/tab-indent.ts'), 'utf8')
		).to.not.include('  ')
	})

	test('commitlint works', async () => {
		const messageTxtPath = path.join(tempFixturePath, 'message.txt')
		await fs.promises.writeFile(messageTxtPath, 'fix: fix')
		await execa('pnpm', ['exec', 'commitlint', '--edit', messageTxtPath], {
			cwd: tempFixturePath,
			stdio: 'inherit',
		})
	})

	test('markdownlint works', async () => {
		const readmePath = path.join(tempFixturePath, 'readme.md')
		await execa('pnpm', ['exec', 'markdownlint', readmePath], {
			cwd: tempFixturePath,
			stdio: 'inherit',
		})
	})

	test('typescript works', async () => {
		await execaCommand('pnpm exec tsc --noEmit', {
			cwd: tempFixturePath,
			stdio: 'inherit',
		})

		await execaCommand('pnpm exec node-ts ./src/file1.ts', {
			cwd: tempFixturePath,
			stdio: 'inherit',
		})

		await execaCommand(
			'pnpm exec node-ts --resolve-pkg-from-file ./src/file1.ts',
			{
				cwd: tempFixturePath,
				stdio: 'inherit',
			}
		)

		const { stdout } = await execaCommand('pnpm exec run-bin env', {
			cwd: tempFixturePath,
		})

		expect(stdout).toEqual('1')
	})

	test('lint-staged works', async () => {
		await execaCommand('pnpm exec lint-staged', {
			cwd: tempFixturePath,
			stdio: 'inherit',
		})
	})

	test('typecheck utility script works', async () => {
		await execaCommand('pnpm exec typecheck', {
			cwd: tempFixturePath,
			stdio: 'inherit',
		})
	})
})
