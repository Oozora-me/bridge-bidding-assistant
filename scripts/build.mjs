/**
 * 构建脚本
 * - 构建前端和后端
 * - 输出到根目录 dist/
 * - 打包为压缩文件
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, createWriteStream } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(rootDir, 'dist')

console.log('🚀 开始构建...\n')

// 清理根目录 dist
execSync(`rm -rf "${distDir}"`, { stdio: 'pipe' })
mkdirSync(distDir, { recursive: true })

// ==================== 构建后端 ====================
console.log('📦 构建后端...')
const backendDir = resolve(rootDir, 'packages/backend')
const backendDistSrc = resolve(backendDir, 'dist')
const backendDist = resolve(distDir, 'backend')

// 清理并编译
execSync(`rm -rf "${backendDistSrc}"`, { stdio: 'pipe' })
execSync('npx tsc', { cwd: backendDir, stdio: 'inherit' })

// 修改 package.json
const backendPkg = JSON.parse(readFileSync(resolve(backendDir, 'package.json'), 'utf-8'))
backendPkg.scripts.start = 'node index.js'
delete backendPkg.devDependencies
writeFileSync(resolve(backendDistSrc, 'package.json'), JSON.stringify(backendPkg, null, 2))

// 复制到 dist/backend
execSync(`cp -r "${backendDistSrc}" "${backendDist}"`, { stdio: 'inherit' })

// 安装生产依赖
console.log('  安装生产依赖...')
execSync('npm install --production', { cwd: backendDist, stdio: 'inherit' })

console.log('✅ 后端构建完成\n')

// ==================== 构建前端 ====================
console.log('📦 构建前端...')
const frontendDir = resolve(rootDir, 'packages/frontend')
const frontendDist = resolve(distDir, 'frontend')

execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' })
execSync(`cp -r "${frontendDir}/dist" "${frontendDist}"`, { stdio: 'inherit' })

console.log('✅ 前端构建完成\n')

// ==================== 打包压缩 ====================
console.log('📦 打包压缩文件...')

await zipDirectory(backendDist, resolve(distDir, 'backend.zip'))
console.log('  ✓ backend.zip')

await zipDirectory(frontendDist, resolve(distDir, 'frontend.zip'))
console.log('  ✓ frontend.zip')

console.log('\n🎉 构建完成！输出目录：', distDir)

/**
 * 压缩目录为 zip 文件
 */
function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => resolve())
    archive.on('error', (err) => reject(err))

    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}
