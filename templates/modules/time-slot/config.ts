import { defineApplicationModule, defineDataModel } from 'openxiangda/config';
const visits=defineDataModel({code:'visits',name:'来访预约',dataPolicyCode:'visit-owner',fields:[
 {code:'visitorName',label:'访客姓名',type:'text.short',required:true,maxLength:100},
 {code:'company',label:'来访单位',type:'text.short',required:true,maxLength:200},
 {code:'area',label:'接待区域',type:'option.single',required:true,options:[{value:'building-3',label:'3 号楼'},{value:'building-5',label:'5 号楼'}]},
 {code:'arriveAt',label:'预计到访',type:'datetime',required:true,timePrecision:'minute'},
 {code:'purpose',label:'来访目的',type:'text.long',required:true,maxLength:2000},
 {code:'status',label:'接待状态',type:'option.single',options:[{value:'arrived',label:'已到访'},{value:'left',label:'已离开'},{value:'cancelled',label:'已取消'}],access:{create:false,update:['app:openxiangda-application:data:visits:update']}},
]});
export default defineApplicationModule({code:'time-slot',models:[visits],crud:[{model:visits.code,user:__USER_SURFACE__,generated:{list:true,detail:true,create:true,update:true,delete:false},list:{model:visits.code,fields:['visitorName','company','status','area','arriveAt','purpose'],searchableFields:['visitorName','company'],filterFields:['area','status','arriveAt'],sortableFields:['arriveAt'],defaultSort:{field:'arriveAt',order:'asc'}},form:{model:visits.code,fields:['visitorName','company','area','arriveAt','purpose','status']},mobile:{enabled:true}}]});
