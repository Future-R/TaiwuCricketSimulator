import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 关键配置：设置为 './' 可确保资源使用相对路径，适配 GitHub Pages 的子目录部署
  base: './', 
  build: {
    outDir: 'dist',
  }
})