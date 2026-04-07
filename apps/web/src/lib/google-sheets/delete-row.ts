import type { sheets_v4 } from 'googleapis';

/**
 * 指定シート内で matcher にマッチする行を物理削除する。
 *
 * 仕組み:
 * 1. spreadsheets.get でシート内部ID (sheetId) をシート名から取得
 * 2. spreadsheets.values.get で全行を取得
 * 3. matcher でヒットする行の 0-based インデックスを収集
 * 4. 降順ソート（末尾から削除することでインデックスシフトを防ぐ）
 * 5. spreadsheets.batchUpdate で deleteDimension を一括実行
 *
 * @returns 削除した行数
 */
export async function deleteMatchingRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  matcher: (row: string[], index: number) => boolean,
  dataStartRow: number = 2
): Promise<number> {
  // 1) シート内部IDを取得
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );
  if (sheet?.properties?.sheetId === undefined || sheet.properties.sheetId === null) {
    throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
  }
  const sheetId = sheet.properties.sheetId;

  // 2) 全行取得
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:L`,
  });
  const rows = data.values || [];

  // 3) マッチする行インデックスを収集
  const matchedIndexes: number[] = [];
  for (let i = dataStartRow; i < rows.length; i++) {
    if (matcher(rows[i] as string[], i)) {
      matchedIndexes.push(i);
    }
  }

  if (matchedIndexes.length === 0) {
    return 0;
  }

  // 4) 降順ソート（末尾から削除）
  matchedIndexes.sort((a, b) => b - a);

  // 5) batchUpdate で一括削除
  const requests = matchedIndexes.map((rowIndex) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS' as const,
        startIndex: rowIndex,       // 0-based, inclusive
        endIndex: rowIndex + 1,     // exclusive
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  return matchedIndexes.length;
}
