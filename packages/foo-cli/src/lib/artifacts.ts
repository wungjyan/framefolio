import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { outro } from '@clack/prompts'

import {
  packagedProductionOutput,
  repositoryProductionOutput
} from './runtime'

/**
 * Copy the main project's build output into the CLI package so the published
 * npm package ships the production server itself. The `web` command then serves
 * the packaged output instead of the repository checkout.
 */
export function copyBuildOutputToPackage() {
  if (!existsSync(resolve(repositoryProductionOutput, 'server/index.mjs'))) {
    return 0
  }

  rmSync(packagedProductionOutput, { recursive: true, force: true })
  cpSync(repositoryProductionOutput, packagedProductionOutput, { recursive: true })

  return 0
}

export function reportBuildResult(prerender: boolean) {
  const copied = existsSync(packagedProductionOutput)
    && existsSync(resolve(packagedProductionOutput, 'server/index.mjs'))

  if (copied) {
    outro(prerender
      ? 'Framefolio 构建完成，产物已复制到 foo-cli 包。'
      : 'Framefolio 构建完成，产物已复制到 foo-cli 包。')
    return
  }

  outro(prerender
    ? 'Framefolio 构建完成，已生成预渲染页面。'
    : 'Framefolio 构建完成。')
}
