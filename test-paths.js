'use strict';
/**
 * 测试数据路径解析
 *
 * 默认使用仓库内 test/fixtures 的最小样本，保证换机 / CI 可复现。
 * 需要跑真实样本库时，通过环境变量覆盖：
 *   PS5_CHEATS_DIR    指向 HEN-Cheats-Collection/cheats（含 shn/ json/ 子目录）
 *   PS5_MC4_SAMPLE    指向单个 MC4 样本文件
 */
const path = require('path');

const FIXTURES = path.join(__dirname, 'test', 'fixtures');

const CH = process.env.PS5_CHEATS_DIR || FIXTURES;
const MC4_SAMPLE = process.env.PS5_MC4_SAMPLE
  || path.join(FIXTURES, 'mc4', 'CUSA18740_01.08.mc4');

module.exports = { FIXTURES, CH, MC4_SAMPLE };
