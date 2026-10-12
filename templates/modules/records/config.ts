import { defineApplicationModule, defineDataModel } from 'openxiangda/config';
const records=defineDataModel({code:'records',name:'业务记录',fields:[{code:'title',label:'标题',type:'text.short',required:true,maxLength:200},{code:'description',label:'说明',type:'text.long',maxLength:2000}]});
export default defineApplicationModule({code:'records',models:[records],crud:[{model:'records',user:false,generated:{list:true,detail:true,create:true,update:true,delete:true},list:{model:'records',searchableFields:['title'],fields:['title','description']},mobile:{enabled:true}}]});
