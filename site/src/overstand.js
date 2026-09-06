// Read the user-parameter export, not derived visible-edge heights.
export function parseOverstandExport(text) {
  let data;
  try {data=JSON.parse(text);}catch{throw new RangeError('Choose a valid Overstand JSON export.');}
  const parameters=data?.parameters;
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))
    throw new RangeError('This file has no Overstand parameters object.');
  const mapping={nutWidth:'fingerboard_width_at_nut',endWidth:'fingerboard_width_at_end',
    boardLength:'fingerboard_length',stringLength:'vsl'};
  const dimensions={};
  for(const [key,source]of Object.entries(mapping)){
    const value=parameters[source];
    if(typeof value!=='number'||!Number.isFinite(value)||value<=0)
      throw new RangeError(`The export needs a positive ${source} value.`);
    dimensions[key]=value;
  }
  const radius=parameters.fingerboard_radius;
  if(radius!==undefined&&(typeof radius!=='number'||!Number.isFinite(radius)||radius<=0))
    throw new RangeError('The exported fingerboard radius must be positive.');
  const name=parameters.instrument_name;
  if(name!==undefined&&typeof name!=='string')throw new RangeError('The exported instrument name must be text.');
  return {dimensions,radius:radius??null,name:name??''};
}
