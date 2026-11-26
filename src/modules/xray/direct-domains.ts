/**
 * Direct-routing names for client configs. No `geosite:` / `geoip:` — Happ on iOS
 * cannot load those dat files inside the 50 MB Network Extension limit.
 *
 * ccTLDs cover every `.ru` / `.cn` (and IDN equivalents). Extras are services
 * hosted on other suffixes that still break when the client IP is foreign.
 */

export const RU_TLDS = ['ru', 'su', 'xn--p1ai'] as const;
export const CN_TLDS = ['cn', 'xn--fiqs8s', 'xn--fiqz9s'] as const;

export const PRIVATE_DOMAINS = [
  'localhost',
  'local',
  'lan',
  'localdomain',
  'home',
  'internal',
  'invalid',
  'arpa',
] as const;

/** Russian services hosted off `.ru` / `.su` / `.рф`. */
export const RU_EXTRA_DOMAINS = [
  'sberbank.com',
  'qiwi.com',
  'yandex.net',
  'yandex.com',
  'yastatic.net',
  'yandexcloud.net',
  'vk.com',
  'userapi.com',
  'vk-cdn.net',
  'vkuser.net',
  'vkuseraudio.net',
  'vkuservideo.net',
  'mycdn.me',
  'mradx.net',
  'my.com',
  'wbstatic.net',
  'avito.st',
  'okko.tv',
  'premier.one',
  'more.tv',
  '2gis.com',
  'habr.com',
  'pobeda.aero',
] as const;

/** Chinese services hosted off `.cn` / `.中国`. */
export const CN_EXTRA_DOMAINS = [
  'wechat.com',
  'weixinbridge.com',
  'wechatpay.com',
  'tenpay.com',
  'qq.com',
  'gtimg.com',
  'idqqimg.com',
  'myqcloud.com',
  'tencent.com',
  'tencent-cloud.net',
  'tencentcs.com',
  'servicewechat.com',
  'alipay.com',
  'alipayobjects.com',
  'antgroup.com',
  'alibaba.com',
  'alibabacloud.com',
  'aliyun.com',
  'aliyuncs.com',
  'alicdn.com',
  'taobao.com',
  'tmall.com',
  'mmstat.com',
  '1688.com',
  'amap.com',
  'autonavi.com',
  'dingtalk.com',
  'youku.com',
  'baidu.com',
  'bdstatic.com',
  'bdimg.com',
  'bcebos.com',
  'baidupcs.com',
  'douyin.com',
  'douyinpic.com',
  'douyinvod.com',
  'toutiao.com',
  'bytedance.com',
  'byteimg.com',
  'snssdk.com',
  'pstatp.com',
  'ixigua.com',
  'jd.com',
  '360buyimg.com',
  'pinduoduo.com',
  'yangkeduo.com',
  'meituan.com',
  'meituan.net',
  'dianping.com',
  'ele.me',
  'xiaohongshu.com',
  'xhscdn.com',
  'vip.com',
  'suning.com',
  'weibo.com',
  'bilibili.com',
  'hdslb.com',
  'biliapi.net',
  'iqiyi.com',
  'iqiyipic.com',
  'kuaishou.com',
  'zhihu.com',
  'zhimg.com',
  'douban.com',
  'netease.com',
  '163.com',
  '126.net',
  'sohu.com',
  'ifeng.com',
  'ctrip.com',
  'trip.com',
  'didiglobal.com',
  'xiaojukeji.com',
  'didichuxing.com',
  'qunar.com',
  'qunarzz.com',
  'fliggy.com',
  'ly.com',
  'elong.com',
  'hellobike.com',
  'mobike.com',
  'qingjuchuxing.com',
  'tujia.com',
  'xiaozhu.com',
  'muniao.com',
  'ziroom.com',
  'ke.com',
  'lianjia.com',
  'anjuke.com',
  'fang.com',
  '58.com',
  'ganji.com',
  'huazhu.com',
  'jinjiang.com',
  'atour.com',
  'bthhotels.com',
  'unionpay.com',
  '95516.com',
  'ccb.com',
  'abchina.com',
  'bankcomm.com',
  'cmbchina.com',
  'chinamobile.com',
  '10010.com',
  'huawei.com',
  'huaweicloud.com',
  'hicloud.com',
  'xiaomi.com',
  'mi.com',
  'miui.com',
  'oppo.com',
  'wangsu.com',
  'qiniu.com',
  'qiniucdn.com',
] as const;

export const RU_DIRECT_DOMAINS = [...RU_TLDS, ...RU_EXTRA_DOMAINS];
export const CN_DIRECT_DOMAINS = [...CN_TLDS, ...CN_EXTRA_DOMAINS];

export const ALL_DIRECT_DOMAINS = [...RU_DIRECT_DOMAINS, ...CN_DIRECT_DOMAINS, ...PRIVATE_DOMAINS];

/** Xray: `domain:example.com` matches the name and every subdomain. */
export function asXrayDomains(names: readonly string[]): string[] {
  return names.map((name) => `domain:${name}`);
}

/**
 * sing-box `domain_suffix`. Leading dot on a ccTLD so a raw-string matcher
 * cannot treat `ru` as a suffix of `guru`. Private names stay unprefixed so
 * `localhost` still matches itself.
 */
export function asSingboxSuffixes(names: readonly string[]): string[] {
  const tlds = new Set<string>([...RU_TLDS, ...CN_TLDS]);
  return names.map((name) => (tlds.has(name) ? `.${name}` : name));
}
