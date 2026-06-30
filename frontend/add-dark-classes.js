import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(__dirname, 'src')

function processDirectory(dir) {
    const files = fs.readdirSync(dir)
    for (const file of files) {
        if (file === 'App.vue') continue; // We already handled App.vue manually
        const fullPath = path.join(dir, file)
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath)
        } else if (fullPath.endsWith('.vue')) {
            let content = fs.readFileSync(fullPath, 'utf8')
            let newContent = content

            const replacements = [
                { from: /(?<![\w:-])bg-white(?!\w|\/)/g, to: 'bg-white dark:bg-slate-900' },
                { from: /(?<![\w:-])text-slate-900(?!\w|\/)/g, to: 'text-slate-900 dark:text-slate-100' },
                { from: /(?<![\w:-])text-slate-800(?!\w|\/)/g, to: 'text-slate-800 dark:text-slate-200' },
                { from: /(?<![\w:-])text-slate-700(?!\w|\/)/g, to: 'text-slate-700 dark:text-slate-300' },
                { from: /(?<![\w:-])text-slate-600(?!\w|\/)/g, to: 'text-slate-600 dark:text-slate-400' },
                { from: /(?<![\w:-])text-slate-500(?!\w|\/)/g, to: 'text-slate-500 dark:text-slate-400' },
                { from: /(?<![\w:-])border-slate-200(?!\w|\/)/g, to: 'border-slate-200 dark:border-slate-700' },
                { from: /(?<![\w:-])border-slate-100(?!\w|\/)/g, to: 'border-slate-100 dark:border-slate-800' },
                { from: /(?<![\w:-])bg-slate-50(?!\w|\/)/g, to: 'bg-slate-50 dark:bg-slate-800' },
                { from: /(?<![\w:-])bg-slate-100(?!\w|\/)/g, to: 'bg-slate-100 dark:bg-slate-800' }
            ];

            for (const r of replacements) {
                newContent = newContent.replace(r.from, r.to)
            }

            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent, 'utf8')
            }
        }
    }
}

processDirectory(srcDir)
