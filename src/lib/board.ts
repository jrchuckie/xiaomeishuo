export type BoardLinkResult = {
  valid: boolean;
  boardId?: string;
  normalizedUrl?: string;
  message: string;
};

export type BoardItem = {
  id: string;
  title: string;
  imageUrl: string;
  author?: string;
};

export function parseXhsBoardLink(input: string): BoardLinkResult {
  try {
    const url = new URL(input.trim());
    if (!/(^|\.)xiaohongshu\.com$/i.test(url.hostname)) {
      return { valid: false, message: "这不是小红书收藏夹链接" };
    }

    const match = url.pathname.match(/^\/board\/([a-zA-Z0-9]+)/);
    if (!match) {
      return { valid: false, message: "没有识别到收藏夹 ID" };
    }

    return {
      valid: true,
      boardId: match[1],
      normalizedUrl: `https://www.xiaohongshu.com/board/${match[1]}`,
      message: "收藏夹链接已识别",
    };
  } catch {
    return { valid: false, message: "链接格式不正确" };
  }
}

export async function importBoardThroughAuthorizedAdapter(url: string): Promise<BoardItem[]> {
  const endpoint = import.meta.env.VITE_XHS_BOARD_ENDPOINT as string | undefined;
  if (!endpoint) {
    throw new Error("NO_AUTHORIZED_ADAPTER");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`BOARD_IMPORT_${response.status}`);
  }

  const data = (await response.json()) as { items?: BoardItem[] };
  return data.items ?? [];
}
