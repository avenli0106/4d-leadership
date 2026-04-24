"""
4D天性测评 - 飞书群消息整理脚本

用法：
1. 在飞书群里右键点击机器人发的测评结果消息，选择"复制"
2. 把所有消息粘贴到一个文本文件（比如 messages.txt），每条消息之间空一行
3. 运行：python export_to_excel.py messages.txt
4. 生成 4d_results.xlsx

或者直接在飞书网页版里批量复制群消息，粘贴到 messages.txt
"""

import re
import sys
import pandas as pd
from datetime import datetime

def parse_messages(text):
    """解析飞书群消息文本，提取测评结果"""
    # 按空行分割成单条消息
    blocks = [b.strip() for b in text.split('\n\n') if b.strip()]
    
    results = []
    for block in blocks:
        if '【4D天性测评结果】' not in block:
            continue
            
        result = {
            '提交时间': '',
            '用户名': '',
            '主导色彩': '',
            '情感F': '',
            '直觉N': '',
            '逻辑T': '',
            '感觉S': '',
            '绿色': '',
            '黄色': '',
            '蓝色': '',
            '橙色': ''
        }
        
        # 提取姓名
        name_match = re.search(r'姓名：(.+)', block)
        if name_match:
            result['用户名'] = name_match.group(1).strip()
        
        # 提取主导色彩
        color_match = re.search(r'主导色彩：(.+?)（', block)
        if color_match:
            result['主导色彩'] = color_match.group(1).strip()
        
        # 提取四项得分
        green_match = re.search(r'绿色（培养型）：(\d+)分', block)
        if green_match:
            result['绿色'] = int(green_match.group(1))
            
        yellow_match = re.search(r'黄色（包融型）：(\d+)分', block)
        if yellow_match:
            result['黄色'] = int(yellow_match.group(1))
            
        blue_match = re.search(r'蓝色（展望型）：(\d+)分', block)
        if blue_match:
            result['蓝色'] = int(blue_match.group(1))
            
        orange_match = re.search(r'橙色（指导型）：(\d+)分', block)
        if orange_match:
            result['橙色'] = int(orange_match.group(1))
        
        # 提取基础维度
        dim_match = re.search(r'情感\(F\)：(\d+)\s*\|\s*逻辑\(T\)：(\d+)', block)
        if dim_match:
            result['情感F'] = int(dim_match.group(1))
            result['逻辑T'] = int(dim_match.group(2))
            
        dim_match2 = re.search(r'直觉\(N\)：(\d+)\s*\|\s*感觉\(S\)：(\d+)', block)
        if dim_match2:
            result['直觉N'] = int(dim_match2.group(1))
            result['感觉S'] = int(dim_match2.group(2))
        
        if result['用户名']:
            result['提交时间'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            results.append(result)
    
    return results

def main():
    if len(sys.argv) < 2:
        print("用法: python export_to_excel.py messages.txt")
        print("")
        print("说明：")
        print("1. 在飞书群里批量复制机器人发的测评消息")
        print("2. 粘贴到 messages.txt 文件（每条消息之间空一行）")
        print("3. 运行此脚本")
        print("4. 生成 4d_results.xlsx")
        return
    
    input_file = sys.argv[1]
    
    with open(input_file, 'r', encoding='utf-8') as f:
        text = f.read()
    
    results = parse_messages(text)
    
    if not results:
        print("未解析到任何测评结果，请检查消息格式")
        return
    
    df = pd.DataFrame(results)
    output_file = '4d_results.xlsx'
    df.to_excel(output_file, index=False, engine='openpyxl')
    
    print(f"✅ 成功解析 {len(results)} 条测评结果")
    print(f"📁 已保存到: {output_file}")
    print("")
    print(df.to_string(index=False))

if __name__ == '__main__':
    main()
