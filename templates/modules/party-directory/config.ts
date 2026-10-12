import { defineApplicationModule, defineDataModel } from 'openxiangda/config';
const companies=defineDataModel({code:'companies',name:'往来单位',fields:[{code:'name',label:'公司名称',type:'text.short',required:true,maxLength:200},{code:'contact',label:'联系人',type:'text.short',maxLength:100},{code:'phone',label:'联系电话',type:'text.short',maxLength:50}]});
export default defineApplicationModule({code:'party-directory',models:[companies],crud:[{model:'companies',generated:{list:true,detail:true,create:true,update:true,delete:true},list:{model:'companies',searchableFields:['name','contact']}}]});
