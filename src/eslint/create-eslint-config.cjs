const fs = require('node:fs')
const path = require('node:path')
const getGlobalRules = require('./global-rules.cjs')
const { defineConfig } = require('eslint-define-config')
const { deepmerge } = require('deepmerge-ts')
const { outdent } = require('outdent')
const findUp = require('@commonjs/find-up')
const pkgUp = require('@commonjs/pkg-up')

if (!fs._existsSync) {
	fs._existsSync = fs.existsSync
}

function shouldStubTsconfigEslintJson(filePath) {
	if (path.basename(filePath) !== 'tsconfig.eslint.json') {
		return false
	}

	const dir = path.dirname(filePath)

	return (
		!fs._existsSync(filePath) && fs._existsSync(path.join(dir, 'tsconfig.json'))
	)
}

/**
	@param {string | undefined} dirname
	@param {import('eslint-define-config').EslintConfig} config
*/
function createESLintConfig(dirname, projectConfig = {}, options = {}) {
	if (dirname === undefined) {
		throw new Error('`dirname` must be provided to `createESLintConfig`')
	}

	if (typeof dirname !== 'string') {
		throw new TypeError(
			'`dirname`, the first argument passed to `createESLintConfig`, must be a string'
		)
	}

	const pkgJsonFile = pkgUp.sync({ cwd: dirname })
	const pnpmWorkspaceFile = findUp.sync('pnpm-workspace.yaml', {
		cwd: dirname,
	})
	const pnpmWorkspaceDir =
		pnpmWorkspaceFile === undefined
			? undefined
			: path.dirname(pnpmWorkspaceFile)

	if (!options.noStubs && !fs.__lionConfigStubbed?.[dirname]) {
		const statSync = fs.statSync
		const existsSync = fs.existsSync
		const readFileSync = fs.readFileSync

		fs.statSync = (...args) => {
			if (shouldStubTsconfigEslintJson(args[0])) {
				return statSync(path.join(path.dirname(args[0]), 'tsconfig.json'))
			}
			// Otherwise, just pass through
			else {
				return statSync(...args)
			}
		}

		fs.existsSync = (...args) => {
			if (shouldStubTsconfigEslintJson(args[0])) {
				return true
			} else {
				return existsSync(...args)
			}
		}

		fs.readFileSync = (...args) => {
			if (shouldStubTsconfigEslintJson(args[0])) {
				return outdent`
					{
						"extends": "./tsconfig.json",
						"include": ["*.*", "**/*.*"]
					}
				`
			} else {
				return readFileSync(...args)
			}
		}

		if (fs.__lionConfigStubbed) {
			fs.__lionConfigStubbed[dirname] = true
		} else {
			fs.__lionConfigStubbed = { [dirname]: true }
		}
	}

	const globalRules = getGlobalRules(dirname)

	const tsconfigEslintPath = fs.existsSync(
		path.resolve(dirname, 'tsconfig.json')
	)
		? path.resolve(dirname, 'tsconfig.eslint.json')
		: undefined

	// From @antfu/eslint-config https://github.com/antfu/eslint-config/blob/f6180054022fa554e313257d724ab26664c1b1b4/packages/basic/index.js#L15
	const ignorePatterns = [
		'dist',
		'generated',
		'__snapshots__',
		'*.min.*',
		'changelog.md',
		'license*',
		'output',
		'coverage',
		'public',
		'package-lock.json',
		'pnpm-lock.yaml',
		'yarn.lock',
		'!.github',
		'!.vitepress',
		'!.vscode',
	]

	if (!options.includeTempFolder) {
		ignorePatterns.push('temp')
	}

	const defaultConfig = defineConfig({
		/**
			After an .eslintrc.js file is loaded, ESLint will normally continue visiting all parent folders to look for other .eslintrc.js files, and also consult a personal file ~/.eslintrc.js. If any files are found, their options will be merged.  This is difficult for humans to understand, and it will cause nondeterministic behavior if files are loaded from outside the Git working folder.

			Setting `root: true` causes ESLint to stop looking for other config files after the first .eslintrc.js is loaded.
		*/
		root: true,

		parserOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			project: tsconfigEslintPath,
			extraFileExtensions: ['.vue', '.json', '.jsonc', '.md'],
			/** @see https://github.com/typescript-eslint/typescript-eslint/issues/2094 */
			EXPERIMENTAL_useSourceOfProjectReferenceRedirect: true,
		},

		extends: [
			'xo',
			require.resolve('./plugins.cjs'),
			'plugin:vue/vue3-recommended',
			'plugin:eslint-comments/recommended',
			'plugin:jsonc/recommended-with-jsonc',
			'plugin:jsonc/prettier',
			'plugin:yml/standard',
			'plugin:markdown/recommended', // Lint code inside markdown files
			'prettier',
		],

		plugins: ['simple-import-sort', 'vue', 'prettier'],

		ignorePatterns,

		// Rules should not be smart-merged but instead overwritten
		rules: { ...globalRules, ...projectConfig.rules },
		overrides: [
			{
				// Code blocks in markdown file
				files: ['**/*.md/*.*'],
				parserOptions: {
					project: null,
				},
				rules: {
					'@typescript-eslint/no-redeclare': 'off',
					'@typescript-eslint/no-unused-vars': 'off',
					'@typescript-eslint/no-use-before-define': 'off',
					'@typescript-eslint/no-var-requires': 'off',
					'@typescript-eslint/comma-dangle': 'off',
					'import/no-unresolved': 'off',
					'no-alert': 'off',
					'no-restricted-imports': 'off',
					'no-undef': 'off',
					'no-unused-expressions': 'off',
					'no-unused-vars': 'off',
				},
			},
			{
				files: '**/.eslintrc.cjs',
				env: {
					browser: false,
					node: true,
				},
			},
			{
				files: ['*.cjs', '*.cts'],
				rules: {
					'@typescript-eslint/no-require-imports': 'off',
					'@typescript-eslint/no-var-requires': 'off',
					'unicorn/prefer-module': 'off',
				},
			},
			{
				files: ['*.ts', '*.cts', '*.mts', '*.tsx', '*.vue'],
				// Explicitly exclude markdown files because they need to have `parserOptions.project` disabled (see https://github.com/eslint/eslint-plugin-markdown/issues/114#issuecomment-843769189)
				excludedFiles: ['*.md', '**/*.md/*.*'],
				extends: [
					'xo',
					'xo-typescript',
					require.resolve('./plugins.cjs'),
					'plugin:vue/vue3-recommended',
					'plugin:eslint-comments/recommended',
					'plugin:jsonc/recommended-with-jsonc',
					'plugin:jsonc/prettier',
					'plugin:yml/standard',
					'plugin:markdown/recommended', // Lint code inside markdown files
					'prettier',
				],
				parserOptions: {
					parser: '@typescript-eslint/parser',
					ecmaVersion: 2018,
					sourceType: 'module',
					project: tsconfigEslintPath,
					extraFileExtensions: ['.vue', '.cjs', '.cts', '.mjs', '.mts'],
				},
				rules: {
					...globalRules,
					'@typescript-eslint/no-unused-vars': [
						'error',
						{
							args: 'after-used',
							argsIgnorePattern: '^_',
							varsIgnorePattern: '^_',
							caughtErrorsIgnorePattern: '^_',
						},
					],
					'import/named': 'off',
					'@typescript-eslint/unified-signatures': 'off', // I prefer to add the events for Vue's defineEmits<{}> separately instead of using a unified signature
					'@typescript-eslint/no-unnecessary-condition': 'error',
					'@typescript-eslint/no-unsafe-member-access': 'off',
					'@typescript-eslint/no-unsafe-call': 'off',
					'@typescript-eslint/no-unsafe-return': 'off',
					'@typescript-eslint/no-unsafe-argument': 'off',
					'@typescript-eslint/no-unsafe-assignment': 'off',
					...projectConfig.rules,
				},
			},
			{
				files: ['*.vue'],
				rules: {
					'import/no-default-export': 'off',
					'import/no-anonymous-default-export': 'off', // export default { inheritAttrs: false }
					'import/first': 'off',
					// Reactivity transform
					'vue/no-setup-props-destructure': 'off',
				},
			},
			{
				files: ['scripts/**/*.*', 'src/bin/**/*.*'],
				rules: {
					'unicorn/no-process-exit': 'off',
				},
			},
			{
				files: ['src/**/*.*'],
				rules: {
					'import/no-extraneous-dependencies': [
						'error',
						{
							packageDir:
								pnpmWorkspaceDir === undefined
									? [path.dirname(pkgJsonFile)]
									: [path.dirname(pkgJsonFile), pnpmWorkspaceDir],
						},
					],
					...projectConfig.rules,
				},
			},
			{
				files: ['*.json', '*.json5'],
				parser: 'jsonc-eslint-parser',
			},
			{
				files: ['*.yaml', '*.yml'],
				parser: 'yaml-eslint-parser',
				rules: {
					'spaced-comment': 'off',
				},
			},
			// From @antfu/eslint-plugin: https://github.com/antfu/eslint-config/blob/f6180054022fa554e313257d724ab26664c1b1b4/packages/basic/index.js#L65
			{
				files: ['package.json'],
				parser: 'jsonc-eslint-parser',
				rules: {
					'jsonc/sort-keys': [
						'error',
						{
							pathPattern: '^$',
							order: [
								'name',
								'type',
								'version',
								'private',
								'packageManager',
								'description',
								'keywords',
								'license',
								'author',
								'repository',
								'funding',
								'main',
								'module',
								'types',
								'unpkg',
								'jsdelivr',
								'exports',
								'files',
								'bin',
								'sideEffects',
								'scripts',
								'peerDependencies',
								'peerDependenciesMeta',
								'dependencies',
								'optionalDependencies',
								'devDependencies',
								'husky',
								'lint-staged',
								'eslintConfig',
							],
						},
						{
							pathPattern: '^(?:dev|peer|optional|bundled)?[Dd]ependencies$',
							order: { type: 'asc' },
						},
					],
				},
			},
		],
	})

	delete projectConfig.rules

	return deepmerge(defaultConfig, projectConfig)
}

module.exports = { createESLintConfig }
