export const PLUGIN_NAME = 'aka-ai-video-generator'
export const DATA_DIR_NAME = 'aka-ai-video-generator'

/** 视频任务轮询间隔（毫秒） */
export const POLL_INTERVAL_MS = 5000

/** 多图上限 */
export const MAX_MULTI_IMAGES = 4

/** 命令名（避开 v1 占用的「单图生视频/多图生视频/查询视频」） */
export const CMD_VIDEO = '视频生成'
export const CMD_TEXT2VIDEO = '文生视频'
export const CMD_IMG2VIDEO = '视频生成'
export const CMD_MULTI_IMG2VIDEO = '合图生视频'
export const CMD_QUERY = '视频任务'
export const CMD_BALANCE = '视频余额'
export const CMD_HELP = '视频帮助'
