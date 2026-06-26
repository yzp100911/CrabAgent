/**
 * 向量嵌入服务
 * 基于 @huggingface/transformers 的语义搜索支持
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_MODEL_DIR = path.resolve(__dirname, '..', '..', 'models', 'bge-base-zh-v1.5');
const DEFAULT_MODEL = 'Xenova/bge-base-zh-v1.5';
const DEFAULT_DIMENSION = 768;

export class EmbeddingService {
  /**
   * @param {object} [options]
   * @param {string} [options.model] - 模型名称
   * @param {number} [options.dimension] - 向量维度
   */
  constructor(options = {}) {
    this._model = options.model || DEFAULT_MODEL;
    this._dimension = options.dimension || DEFAULT_DIMENSION;
    this._pipeline = null;
    this._ready = false;
  }

  /**
   * 加载模型（首次需联网下载 ~47MB，后续使用本地缓存）
   * @returns {Promise<boolean>} 是否加载成功
   */
  async init() {
    try {
      // 优先使用本地模型目录（云服务器无法访问 HuggingFace）
      const modelPath = existsSync(LOCAL_MODEL_DIR) ? LOCAL_MODEL_DIR : this._model;
      if (modelPath === LOCAL_MODEL_DIR) {
        console.log(`  🧬 使用本地嵌入模型: ${LOCAL_MODEL_DIR}`);
      }
      const { pipeline } = await import('@huggingface/transformers');
      this._pipeline = await pipeline('feature-extraction', modelPath, {
        dtype: 'fp32',
      });
      this._ready = true;
      return true;
    } catch (err) {
      console.warn(`  ⚠️ 嵌入模型加载失败: ${err.message}`);
      if (err.cause) console.warn(`  ⚠️ cause: ${err.cause.code || err.cause.message}`);
      this._ready = false;
      return false;
    }
  }

  /** 模型是否就绪 */
  isReady() {
    return this._ready;
  }

  /**
   * 将文本转换为向量
   * @param {string} text
   * @returns {Promise<Float32Array|null>}
   */
  async embed(text) {
    if (!this._ready || !this._pipeline) return null;
    try {
      const output = await this._pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });
      return new Float32Array(output.data);
    } catch {
      return null;
    }
  }

  /**
   * 余弦相似度（向量已归一化，直接点积）
   * @param {Float32Array} a
   * @param {Float32Array} b
   * @returns {number}
   */
  static cosineSimilarity(a, b) {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * 批量计算相似度并排序
   * @param {Float32Array} queryVec - 查询向量
   * @param {Array<{id: number, vector: Float32Array}>} vectors - 存储向量列表
   * @param {number} [threshold=0.5] - 相似度阈值
   * @returns {Array<{id: number, score: number}>} 按分数降序排列
   */
  static cosineSimilarityBatch(queryVec, vectors, threshold = 0.5) {
    const results = [];
    for (const { id, vector } of vectors) {
      const score = EmbeddingService.cosineSimilarity(queryVec, vector);
      if (score >= threshold) {
        results.push({ id, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
