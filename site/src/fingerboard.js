// Same equal-tempered fret formula as Overstand's calculateFretPositions.
export function fretDistance(stringLength, fret) {
  if(!Number.isFinite(stringLength)||stringLength<=0||!Number.isInteger(fret)||fret<0)
    throw new RangeError('Use a positive string length and a nonnegative whole fret number.');
  return stringLength-stringLength/2**(fret/12);
}

export function fingerboardSections(dimensions) {
  const {nutWidth,endWidth,boardLength,stringLength}=dimensions;
  for(const value of [nutWidth,endWidth,boardLength,stringLength])
    if(!Number.isFinite(value)||value<=0)throw new RangeError('Enter all four dimensions as positive millimetre values.');
  if(boardLength>stringLength)throw new RangeError('Fingerboard length cannot exceed the vibrating string length.');
  return [1,7].map(fret=>{
    const distance=fretDistance(stringLength,fret);
    const onBoard=distance<=boardLength;
    return {fret,distance,onBoard,width:onBoard?nutWidth+(endWidth-nutWidth)*distance/boardLength:null};
  });
}

export function scaleSection(preset,width) {
  if(!Number.isFinite(width)||width<=0)throw new RangeError('Use a positive section width.');
  const factor=width/preset.width;
  return {width,radius:preset.radius*factor,thickness:preset.thickness*factor,blend:preset.blend*factor};
}
