import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 배포 타깃별 base 경로 분기 (DESIGN 2장):
//  - GitHub Pages: /HK_Chess/   (DEPLOY_TARGET=ghpages, 리포 이름과 일치해야 함)
//  - Firebase Hosting / 로컬 dev: /
const base = process.env.DEPLOY_TARGET === 'ghpages' ? '/HK_Chess/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    // 도메인 로직 단위 테스트는 순수 JS라 node 환경이면 충분
    environment: 'node',
    include: ['src/test/**/*.test.js'],
  },
});
