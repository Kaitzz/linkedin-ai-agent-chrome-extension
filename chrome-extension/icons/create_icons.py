from PIL import Image, ImageDraw

def create_icon(size):
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    margin = size // 8
    draw.ellipse([margin, margin, size-margin, size-margin], fill='#0a66c2')
    
    center = size // 2
    radius = size // 5
    stroke_width = max(2, size // 12)
    
    # Draw two overlapping circles (link symbol)
    offset = radius // 2
    draw.ellipse([center-radius-offset, center-radius, center+offset, center+radius], 
                 outline='white', width=stroke_width)
    draw.ellipse([center-offset, center-radius, center+radius+offset, center+radius],
                 outline='white', width=stroke_width)
    
    return img

for size in [16, 32, 48, 128]:
    img = create_icon(size)
    img.save(f'icon{size}.png')
    print(f'Created icon{size}.png')
