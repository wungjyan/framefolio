import { defineConfig } from 'vitepress'
import { cardPlugin } from '@rooom/vitepress-plugins/markdown'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  lang: 'zh-CN',
  title: 'Framefolio',
  description: 'Framefolio 照片画廊项目文档。',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    siteTitle: 'FRAMEFOLIO / 项目手记',
    nav: [
      { text: '指南', link: '/guide/overview' },
      { text: '需求清单', link: '/requirements/001-gallery-toolchain' },
      { text: '任务列表', link: '/tasks/001-gallery-toolchain-tasks' },
      { text: '参考', link: '/reference/cli' },
      { text: '规范', link: '/specs/' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '项目指南',
          items: [
            { text: '项目概览', link: '/guide/overview' },
            { text: '架构', link: '/guide/architecture' },
            { text: '开发', link: '/guide/development' },
            { text: '发布', link: '/guide/release' }
          ]
        }
      ],
      '/requirements/': [
        {
          text: '需求清单',
          items: [
            {
              text: '001 简洁画廊工具链',
              link: '/requirements/001-gallery-toolchain'
            }
          ]
        }
      ],
      '/tasks/': [
        {
          text: '任务列表',
          items: [
            {
              text: '001 工具链任务拆解',
              link: '/tasks/001-gallery-toolchain-tasks'
            }
          ]
        }
      ],
      '/reference/': [
        {
          text: '参考资料',
          items: [
            { text: 'CLI', link: '/reference/cli' },
            { text: '配置', link: '/reference/configuration' }
          ]
        }
      ],
      '/specs/': [
        {
          text: '规范驱动开发',
          items: [
            { text: '协作约定', link: '/specs/' },
            { text: '照片画廊规范', link: '/specs/001-photo-gallery' }
          ]
        }
      ]
    },
    outline: { level: [2, 3] },
    search: { provider: 'local' }
  },
  markdown: {
    config(markdown) {
      markdown.use(cardPlugin)
    }
  },
  vite: {
    optimizeDeps: {
      include: [
        '@braintree/sanitize-url',
        'cytoscape',
        'cytoscape-cose-bilkent',
        'dayjs',
        'debug',
        'fastdom',
        'fastdom/extensions/fastdom-promised.js'
      ]
    }
  },
  mermaid: {
    theme: 'default'
  }
}))
