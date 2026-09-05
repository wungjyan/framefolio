import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  select
} from '@clack/prompts'

import type { Action } from './actions'

export type StartTargets = {
  docs: boolean
  site: boolean
}

export async function chooseStartTargets(
  requestedDocs: boolean | undefined,
  requestedSite: boolean | undefined,
  skipPrompt: boolean
): Promise<StartTargets | undefined> {
  if (requestedDocs !== undefined || requestedSite !== undefined) {
    return {
      docs: requestedDocs === true,
      site: requestedSite === true
    }
  }

  if (skipPrompt || process.env.CI === 'true') {
    return { docs: false, site: true }
  }

  const answer = await multiselect({
    message: '选择要启动的服务',
    options: [
      {
        value: 'docs',
        label: 'docs',
        hint: '启动 VitePress 文档站'
      },
      {
        value: 'site',
        label: 'site',
        hint: '启动 Nuxt 站点'
      }
    ],
    initialValues: ['site'],
    required: false
  })

  if (isCancel(answer)) {
    cancel('操作已取消。')
    return undefined
  }

  const selected = answer as string[]
  return {
    docs: selected.includes('docs'),
    site: selected.includes('site')
  }
}

export async function confirmGallerySync(
  requested: boolean | undefined,
  skipPrompt: boolean
): Promise<boolean | undefined> {
  if (requested !== undefined) return requested
  if (skipPrompt || process.env.CI === 'true') return true

  const answer = await confirm({
    message: '启动站点前执行图库同步？',
    initialValue: true
  })

  if (isCancel(answer)) {
    cancel('操作已取消。')
    return undefined
  }

  return answer
}

export async function confirmPrerender(
  requested: boolean | undefined,
  skipPrompt: boolean
): Promise<boolean | undefined> {
  if (requested !== undefined) return requested
  if (skipPrompt || process.env.CI === 'true') return false

  const answer = await confirm({
    message: '是否将页面预渲染为可部署的静态资源？',
    initialValue: false
  })

  if (isCancel(answer)) {
    cancel('操作已取消。')
    return undefined
  }

  return answer
}

export async function chooseAction(): Promise<Action | undefined> {
  intro('Framefolio 项目管理器')
  const answer = await select({
    message: '请选择要执行的操作',
    options: [
      { value: 'start', label: '启动', hint: '启动 Nuxt 开发服务器' },
      { value: 'build', label: '构建', hint: '创建生产构建产物' }
    ]
  })

  if (isCancel(answer)) {
    cancel('操作已取消。')
    return undefined
  }

  return answer as Action
}
