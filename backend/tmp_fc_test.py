import sys
with open(r"D:\Industrility\Part Search Prototype\backend\tmp_fc_marker.txt","w",encoding="utf-8") as f:
    f.write("argv="+"|".join(sys.argv))
print("HELLO_FROM_SCRIPT")
