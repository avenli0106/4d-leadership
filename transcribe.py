import whisper
import sys
import os

# 设置 stdout 编码
sys.stdout.reconfigure(encoding='utf-8')

print("加载 Whisper small 模型...")
model = whisper.load_model("small")

print("开始转录音频...")
result = model.transcribe("D:\\Kimi_code_WS\\AI_Study\\audio.mp3", language="zh", verbose=True)

print("\n保存结果...")
with open("D:\\Kimi_code_WS\\AI_Study\\transcription.txt", "w", encoding="utf-8") as f:
    f.write(result["text"])

print("完成！已保存到 transcription.txt")
